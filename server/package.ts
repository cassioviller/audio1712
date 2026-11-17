import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import { transcribeAudio } from "./openai";
import { checkSpeech, segmentsToSrt } from "./speech";

const execAsync = promisify(exec);
const q = (p: string) => `'${p.replace(/'/g, "'\\''")}'`;

export interface PackageOptions {
  fps: number;              // frames per second (8 = one frame every 0,125 s)
  format: "webp" | "jpg";
  transcribe: boolean;
  name: string;             // folder name inside the zip
  legenda?: string;         // optional extra text files sent by the caller
  comentarios?: string;
  leiaMe?: string;
}

async function probe(videoPath: string): Promise<{ duration: number; width: number; height: number; hasAudio: boolean }> {
  const { stdout } = await execAsync(
    `ffprobe -v quiet -print_format json -show_format -show_streams ${q(videoPath)}`,
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const info = JSON.parse(stdout);
  const video = (info.streams || []).find((s: any) => s.codec_type === "video");
  const hasAudio = (info.streams || []).some((s: any) => s.codec_type === "audio");
  return {
    duration: parseFloat(info.format?.duration || "0"),
    width: video?.width || 0,
    height: video?.height || 0,
    hasAudio,
  };
}

/** "0001_00m00,000s" — same naming used in the reference zips */
function frameName(index: number, fps: number, ext: string): string {
  const t = index / fps;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = s.toFixed(3).padStart(6, "0").replace(".", ",");
  return `${String(index + 1).padStart(4, "0")}_${String(m).padStart(2, "0")}m${ss}s.${ext}`;
}

/**
 * Builds a study package from a video:
 *   frames/ (one every 1/fps s), mosaico_1_por_segundo.jpg, capa.jpg, audio.wav,
 *   transcricao.txt + legendas.srt + segmentos.json (if there is audio), and optional text files.
 * Returns the path of the zip. The caller deletes the work directory afterwards.
 */
export async function buildVideoPackage(videoPath: string, workDir: string, opts: PackageOptions): Promise<string> {
  const root = path.join(workDir, opts.name);
  const framesDir = path.join(root, "frames");
  fs.mkdirSync(framesDir, { recursive: true });

  const info = await probe(videoPath);
  if (!info.width) throw new Error("O arquivo não tem trilha de vídeo.");

  // 1. Frames
  const ext = opts.format;
  const quality = ext === "webp" ? "-c:v libwebp -quality 85" : "-q:v 3";
  await execAsync(
    `ffmpeg -y -loglevel error -i ${q(videoPath)} -vf fps=${opts.fps} ${quality} ${q(path.join(framesDir, "tmp_%05d." + ext))}`,
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const tmp = fs.readdirSync(framesDir).filter((f) => f.startsWith("tmp_")).sort();
  tmp.forEach((f, i) => fs.renameSync(path.join(framesDir, f), path.join(framesDir, frameName(i, opts.fps, ext))));

  // 2. Mosaic: one frame per second, 10 columns, with the second written under each frame
  const cols = 10;
  const rows = Math.max(1, Math.ceil(info.duration));
  const tileRows = Math.ceil(rows / cols);
  const font = ["/usr/share/fonts/dejavu/DejaVuSans.ttf", "/usr/share/fonts/ttf-dejavu/DejaVuSans.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]
    .find((f) => fs.existsSync(f));
  const fontOpt = font ? `fontfile=${font}:` : "";
  await execAsync(
    `ffmpeg -y -loglevel error -i ${q(videoPath)} -vf "fps=1,scale=136:-2,pad=iw:ih+18:0:0:black,` +
      `drawtext=${fontOpt}text='%{eif\\:t\\:d}s':x=4:y=h-15:fontsize=13:fontcolor=yellow,tile=${cols}x${tileRows}" ` +
      `-frames:v 1 -q:v 3 ${q(path.join(root, "mosaico_1_por_segundo.jpg"))}`,
  ).catch(async () => {
    // drawtext needs a font; without it, make the mosaic without the labels
    await execAsync(
      `ffmpeg -y -loglevel error -i ${q(videoPath)} -vf "fps=1,scale=136:-2,tile=${cols}x${tileRows}" -frames:v 1 -q:v 3 ${q(path.join(root, "mosaico_1_por_segundo.jpg"))}`,
    );
  });

  // 3. Cover: first frame in full size
  await execAsync(`ffmpeg -y -loglevel error -i ${q(videoPath)} -frames:v 1 -q:v 2 ${q(path.join(root, "capa.jpg"))}`);

  // 4. Audio + transcription
  let speechLine = "Sem trilha de áudio.";
  if (info.hasAudio) {
    const wav = path.join(root, "audio.wav");
    await execAsync(`ffmpeg -y -loglevel error -i ${q(videoPath)} -vn -ac 1 -ar 16000 ${q(wav)}`);
    if (opts.transcribe) {
      const mp3 = path.join(workDir, "audio_tmp.mp3");
      await execAsync(`ffmpeg -y -loglevel error -i ${q(wav)} -codec:a libmp3lame -b:a 64k ${q(mp3)}`);
      try {
        const r = await transcribeAudio(mp3, "audio.mp3");
        const speech = checkSpeech(r.text, r.segments);
        speechLine = speech.hasSpeech ? "Com fala." : (speech.note || "Sem fala.");
        const header =
          `TRANSCRIÇÃO (Whisper, via AudioScript)\n` +
          `${speech.hasSpeech ? "" : "ATENÇÃO: " + speech.note + "\n"}` +
          `Tempos em legendas.srt e segmentos.json. Nomes e termos técnicos podem sair errados: conferir ouvindo.\n\n`;
        const timed = r.segments.map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s] ${s.text}`).join("\n");
        fs.writeFileSync(path.join(root, "transcricao.txt"), "﻿" + header + timed + "\n\nTEXTO CORRIDO:\n" + r.text + "\n");
        fs.writeFileSync(path.join(root, "legendas.srt"), segmentsToSrt(r.segments));
        fs.writeFileSync(path.join(root, "segmentos.json"), JSON.stringify({ hasSpeech: speech.hasSpeech, note: speech.note, segments: r.segments }, null, 2));
      } catch (e) {
        speechLine = "Transcrição falhou: " + (e instanceof Error ? e.message : String(e));
        fs.writeFileSync(path.join(root, "transcricao.txt"), "﻿" + speechLine + "\n");
      } finally {
        if (fs.existsSync(mp3)) fs.unlinkSync(mp3);
      }
    }
  }

  // 5. Optional texts sent by the caller (caption, comments, notes)
  const write = (file: string, txt?: string) => { if (txt && txt.trim()) fs.writeFileSync(path.join(root, file), "﻿" + txt); };
  write("legenda.txt", opts.legenda);
  write("comentarios.txt", opts.comentarios);
  const resumo =
    `Pacote gerado pelo AudioScript em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}\n` +
    `Duração: ${info.duration.toFixed(2)} s | ${info.width}x${info.height}\n` +
    `Frames: ${tmp.length} (${opts.fps} por segundo = um a cada ${(1 / opts.fps).toFixed(3).replace(".", ",")} s, .${ext})\n` +
    `Áudio: ${speechLine}\n`;
  fs.writeFileSync(path.join(root, "LEIA-ME.txt"), "﻿" + (opts.leiaMe ? opts.leiaMe.trim() + "\n\n---\n" : "") + resumo);

  // 6. Zip (store only: images are already compressed)
  const zipPath = path.join(workDir, `${opts.name}.zip`);
  await execAsync(`cd ${q(workDir)} && zip -0 -r -q ${q(zipPath)} ${q(opts.name)}`, { maxBuffer: 10 * 1024 * 1024 });
  return zipPath;
}

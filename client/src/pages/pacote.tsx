import { useEffect, useRef, useState } from "react";
import {
  AlertCircle, CheckCircle2, ChevronDown, ChevronUp, Copy, Download, FileVideo, Loader2,
  Play, Trash2, Upload, X,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { downloadBlob, readZip, safeName, textEntry, writeZip, type ZipEntry } from "@/lib/zip";
import { formatFileSize } from "@/lib/file-utils";
import { cn } from "@/lib/utils";

type Status = "aguardando" | "enviando" | "processando" | "pronto" | "erro";

interface Preview {
  capaUrl?: string;
  mosaicoUrl?: string;
  transcricao?: string;
  frames: number;
  duracao?: string;
  audio?: string;
  temFala: boolean;
}

interface Item {
  id: string;
  file: File;
  name: string;
  perfil: string;
  link: string;
  legenda: string;
  comentarios: string;
  notas: string;
  status: Status;
  uploadPct: number;
  error?: string;
  zip?: ArrayBuffer;
  preview?: Preview;
  seconds?: number;
  open: boolean;
}

interface Settings {
  tema: string;
  fps: string;
  format: "webp" | "jpg";
  transcribe: boolean;
}

const VIDEO_EXT = [".mp4", ".mov", ".webm", ".mkv"];
const MAX_SIZE = 100 * 1024 * 1024;

function baseName(file: File) {
  return file.name.replace(/\.[^.]+$/, "");
}

function packageName(item: Pick<Item, "name" | "perfil" | "file">) {
  const n = item.name.trim() || [item.perfil, baseName(item.file)].filter(Boolean).join("_");
  return safeName(n) || "video";
}

function buildLeiaMe(item: Item, settings: Settings) {
  const lines = [`REFERÊNCIA: ${packageName(item)}`];
  if (item.perfil.trim()) lines.push(`Perfil: @${item.perfil.trim().replace(/^@/, "")}`);
  if (item.link.trim()) lines.push(`Link: ${item.link.trim()}`);
  if (settings.tema.trim()) lines.push(`Tema: ${settings.tema.trim()}`);
  lines.push(`Arquivo original: ${item.file.name}`);
  if (item.notas.trim()) lines.push("", "POR QUE É REFERÊNCIA / O QUE OLHAR:", item.notas.trim());
  return lines.join("\n");
}

/** Sends one video to /api/package with real upload progress and returns the zip. */
function postPackage(item: Item, settings: Settings, onUpload: (pct: number) => void): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append("videoFile", item.file);
    fd.append("name", packageName(item));
    fd.append("fps", settings.fps);
    fd.append("format", settings.format);
    fd.append("transcribe", settings.transcribe ? "1" : "0");
    fd.append("leiaMe", buildLeiaMe(item, settings));
    if (item.legenda.trim()) fd.append("legenda", item.legenda);
    if (item.comentarios.trim()) fd.append("comentarios", item.comentarios);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/package");
    xhr.responseType = "arraybuffer";
    xhr.upload.onprogress = (e) => { if (e.lengthComputable) onUpload(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status === 200) return resolve(xhr.response as ArrayBuffer);
      let msg = `Erro ${xhr.status} ao gerar o pacote.`;
      try {
        const data = JSON.parse(new TextDecoder().decode(xhr.response as ArrayBuffer));
        if (data.error) msg = data.error;
      } catch { /* resposta não era JSON */ }
      reject(new Error(msg));
    };
    xhr.onerror = () => reject(new Error("Falha de conexão com o servidor."));
    xhr.send(fd);
  });
}

function text(entry?: ZipEntry) {
  return entry ? new TextDecoder().decode(entry.data).replace(/^﻿/, "") : undefined;
}

function buildPreview(zip: ArrayBuffer): Preview {
  const entries = readZip(zip);
  const find = (suffix: string) => entries.find((e) => e.name.endsWith("/" + suffix));
  const toUrl = (e?: ZipEntry) => (e ? URL.createObjectURL(new Blob([e.data], { type: "image/jpeg" })) : undefined);
  const leia = text(find("LEIA-ME.txt")) || "";
  const transcricao = text(find("transcricao.txt"));
  const audio = leia.match(/Áudio: (.*)/)?.[1];
  return {
    capaUrl: toUrl(find("capa.jpg")),
    mosaicoUrl: toUrl(find("mosaico_1_por_segundo.jpg")),
    transcricao,
    frames: entries.filter((e) => e.name.includes("/frames/")).length,
    duracao: leia.match(/Duração: ([\d.]+) s/)?.[1],
    audio,
    temFala: !!audio && audio.startsWith("Com fala"),
  };
}

const statusLabel: Record<Status, string> = {
  aguardando: "Aguardando",
  enviando: "Enviando",
  processando: "Gerando frames e transcrição",
  pronto: "Pronto",
  erro: "Erro",
};

export default function Pacote() {
  const { toast } = useToast();
  const [items, setItems] = useState<Item[]>([]);
  const [settings, setSettings] = useState<Settings>({ tema: "", fps: "8", format: "webp", transcribe: true });
  const [running, setRunning] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // Free preview images when the page closes.
  useEffect(() => () => {
    itemsRef.current.forEach((i) => {
      if (i.preview?.capaUrl) URL.revokeObjectURL(i.preview.capaUrl);
      if (i.preview?.mosaicoUrl) URL.revokeObjectURL(i.preview.mosaicoUrl);
    });
  }, []);

  const update = (id: string, patch: Partial<Item>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const addFiles = (files: FileList | File[]) => {
    const added: Item[] = [];
    const rejected: string[] = [];
    Array.from(files).forEach((file) => {
      const ok = VIDEO_EXT.some((ext) => file.name.toLowerCase().endsWith(ext));
      if (!ok) return rejected.push(`${file.name}: formato não é vídeo (use MP4, MOV, WEBM ou MKV)`);
      if (file.size > MAX_SIZE) return rejected.push(`${file.name}: maior que 100 MB`);
      added.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file, name: "", perfil: "", link: "", legenda: "", comentarios: "", notas: "",
        status: "aguardando", uploadPct: 0, open: true,
      });
    });
    if (added.length) setItems((list) => [...list.map((i) => ({ ...i, open: false })), ...added]);
    if (rejected.length) toast({ title: "Alguns arquivos ficaram de fora", description: rejected.join("\n"), variant: "destructive" });
  };

  const removeItem = (id: string) => setItems((list) => list.filter((i) => i.id !== id));

  const runQueue = async () => {
    setRunning(true);
    const queue = itemsRef.current.filter((i) => i.status === "aguardando" || i.status === "erro");
    for (const item of queue) {
      const current = itemsRef.current.find((i) => i.id === item.id);
      if (!current) continue; // removido da lista enquanto esperava
      const started = performance.now();
      update(item.id, { status: "enviando", uploadPct: 0, error: undefined });
      try {
        const zip = await postPackage(current, settings, (pct) =>
          update(item.id, pct >= 100 ? { uploadPct: 100, status: "processando" } : { uploadPct: pct }));
        const preview = buildPreview(zip);
        update(item.id, {
          status: "pronto", zip, preview, open: true,
          seconds: (performance.now() - started) / 1000,
        });
      } catch (e) {
        update(item.id, { status: "erro", error: e instanceof Error ? e.message : String(e) });
      }
    }
    setRunning(false);
  };

  const downloadOne = (item: Item) => {
    if (!item.zip) return;
    downloadBlob(new Blob([item.zip], { type: "application/zip" }), `${packageName(item)}.zip`);
  };

  const ready = items.filter((i) => i.status === "pronto" && i.zip);
  const pending = items.filter((i) => i.status === "aguardando" || i.status === "erro").length;

  const downloadAll = () => {
    const root = settings.tema.trim() ? `tema_${safeName(settings.tema)}_referencias` : `referencias_${new Date().toISOString().slice(0, 10)}`;
    const used = new Set<string>();
    const entries: ZipEntry[] = [];
    const resumo: string[] = [
      `REFERÊNCIAS${settings.tema.trim() ? " — " + settings.tema.trim() : ""}`,
      `Gerado em ${new Date().toLocaleString("pt-BR")} pelo AudioScript (${ready.length} vídeo${ready.length === 1 ? "" : "s"}).`,
      `Cada pasta tem: frames/ (${settings.fps} por segundo), mosaico_1_por_segundo.jpg, capa.jpg, audio.wav, transcricao.txt, legendas.srt e o LEIA-ME do vídeo.`,
      "",
    ];
    ready.forEach((item, idx) => {
      let folder = packageName(item);
      for (let n = 2; used.has(folder); n++) folder = `${packageName(item)}_${n}`;
      used.add(folder);
      readZip(item.zip!).forEach((e) => {
        const rest = e.name.split("/").slice(1).join("/");
        entries.push({ ...e, name: `${root}/${folder}/${rest}` });
      });
      resumo.push(
        `${idx + 1}. ${folder}`,
        ...(item.perfil.trim() ? [`   Perfil: @${item.perfil.trim().replace(/^@/, "")}`] : []),
        ...(item.link.trim() ? [`   Link: ${item.link.trim()}`] : []),
        `   Duração: ${item.preview?.duracao ?? "?"} s | Áudio: ${item.preview?.audio ?? "?"}`,
        ...(item.notas.trim() ? [`   Por que é referência: ${item.notas.trim().replace(/\n+/g, " ")}`] : []),
        "",
      );
    });
    entries.unshift(textEntry(`${root}/LEIA-ME.txt`, resumo.join("\n")));
    downloadBlob(writeZip(entries), `${root}.zip`);
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: "Copiado" });
    } catch {
      toast({ title: "Não foi possível copiar", variant: "destructive" });
    }
  };

  return (
    <div className="font-sans bg-gray-50 min-h-screen">
      <AppHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        {/* Configurações do lote */}
        <Card>
          <CardContent className="pt-6 grid gap-4 sm:grid-cols-4">
            <div className="sm:col-span-2 space-y-1.5">
              <Label htmlFor="tema">Tema do lote</Label>
              <Input
                id="tema" placeholder="ex.: telhado, chalés, steel frame"
                value={settings.tema}
                onChange={(e) => setSettings({ ...settings, tema: e.target.value })}
                data-testid="input-tema"
              />
              <p className="text-xs text-secondary">Vira o nome do zip geral: tema_&lt;tema&gt;_referencias.zip</p>
            </div>
            <div className="space-y-1.5">
              <Label>Frames</Label>
              <Select value={settings.fps} onValueChange={(fps) => setSettings({ ...settings, fps })}>
                <SelectTrigger data-testid="select-fps"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="8">8 por segundo (0,125 s) — padrão</SelectItem>
                  <SelectItem value="4">4 por segundo (0,25 s)</SelectItem>
                  <SelectItem value="2">2 por segundo (0,5 s)</SelectItem>
                  <SelectItem value="1">1 por segundo</SelectItem>
                  <SelectItem value="12">12 por segundo (0,083 s)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Formato e áudio</Label>
              <div className="flex items-center gap-3 h-10">
                <Select value={settings.format} onValueChange={(v) => setSettings({ ...settings, format: v as "webp" | "jpg" })}>
                  <SelectTrigger className="w-24" data-testid="select-format"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="webp">WEBP</SelectItem>
                    <SelectItem value="jpg">JPG</SelectItem>
                  </SelectContent>
                </Select>
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={settings.transcribe}
                    onCheckedChange={(transcribe) => setSettings({ ...settings, transcribe })}
                    data-testid="switch-transcribe"
                  />
                  Transcrever
                </label>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Área de soltar vídeos */}
        <div
          className={cn(
            "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors bg-white",
            dragOver ? "border-primary bg-accent" : "border-gray-300 hover:border-primary",
          )}
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer.files); }}
          data-testid="dropzone"
        >
          <Upload className="w-8 h-8 mx-auto text-primary mb-2" />
          <p className="font-medium text-gray-900">Arraste os vídeos de referência aqui ou clique para escolher</p>
          <p className="text-sm text-secondary mt-1">MP4, MOV, WEBM ou MKV, até 100 MB cada. Pode mandar vários de uma vez.</p>
          <input
            ref={inputRef} type="file" multiple accept={VIDEO_EXT.join(",") + ",video/*"} className="hidden"
            onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }}
            data-testid="input-videos"
          />
        </div>

        {/* Ações do lote */}
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={runQueue} disabled={running || pending === 0} data-testid="button-gerar">
              {running ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
              {running ? "Gerando..." : `Gerar ${pending} pacote${pending === 1 ? "" : "s"}`}
            </Button>
            <Button variant="outline" onClick={downloadAll} disabled={ready.length === 0} data-testid="button-baixar-tudo">
              <Download className="w-4 h-4 mr-2" />
              Baixar tudo num zip ({ready.length})
            </Button>
            <Button variant="ghost" onClick={() => setItems([])} disabled={running} className="ml-auto text-secondary" data-testid="button-limpar">
              <Trash2 className="w-4 h-4 mr-2" />
              Limpar lista
            </Button>
          </div>
        )}

        {/* Lista de vídeos */}
        <div className="space-y-4">
          {items.map((item, idx) => (
            <Card key={item.id} data-testid={`item-${idx}`}>
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-start gap-3">
                  {item.preview?.capaUrl ? (
                    <img src={item.preview.capaUrl} alt="" className="w-12 h-20 object-cover rounded-md bg-gray-200 shrink-0" />
                  ) : (
                    <div className="w-12 h-20 rounded-md bg-gray-100 flex items-center justify-center shrink-0">
                      <FileVideo className="w-5 h-5 text-secondary" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">{packageName(item)}</p>
                    <p className="text-xs text-secondary truncate">{item.file.name} · {formatFileSize(item.file.size)}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm">
                      <StatusBadge status={item.status} />
                      {item.status === "pronto" && item.preview && (
                        <span className="text-secondary">
                          {item.preview.frames} frames · {item.preview.duracao ?? "?"} s · {item.preview.audio ?? "sem áudio"}
                          {item.seconds ? ` · ${item.seconds.toFixed(0)} s para gerar` : ""}
                        </span>
                      )}
                      {item.status === "erro" && <span className="text-red-600">{item.error}</span>}
                    </div>
                    {item.status === "enviando" && <Progress value={item.uploadPct} className="h-1.5 mt-2" />}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {item.status === "pronto" && (
                      <Button size="sm" onClick={() => downloadOne(item)} data-testid={`button-baixar-${idx}`}>
                        <Download className="w-4 h-4 mr-1" /> Zip
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" onClick={() => update(item.id, { open: !item.open })} aria-label="Abrir ou fechar">
                      {item.open ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </Button>
                    <Button
                      size="icon" variant="ghost" onClick={() => removeItem(item.id)} aria-label="Remover"
                      disabled={item.status === "enviando" || item.status === "processando"}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {item.open && (
                  <>
                    {/* Dados do vídeo: editáveis até gerar */}
                    <fieldset
                      disabled={item.status === "enviando" || item.status === "processando" || item.status === "pronto"}
                      className="grid gap-3 sm:grid-cols-3"
                    >
                      <Field label="Perfil" placeholder="@perfil" value={item.perfil} onChange={(perfil) => update(item.id, { perfil })} />
                      <Field label="Link do post" placeholder="https://www.instagram.com/reel/..." value={item.link} onChange={(link) => update(item.id, { link })} />
                      <Field label="Nome da pasta" placeholder={packageName({ ...item, name: "" })} value={item.name} onChange={(name) => update(item.id, { name })} />
                      <Area label="Por que é referência / o que olhar" value={item.notas} onChange={(notas) => update(item.id, { notas })}
                        placeholder="ex.: gancho em 1 s, corte da laje em 3D, CTA no final" className="sm:col-span-3" />
                      <Area label="Legenda do post" value={item.legenda} onChange={(legenda) => update(item.id, { legenda })} />
                      <Area label="Comentários" value={item.comentarios} onChange={(comentarios) => update(item.id, { comentarios })}
                        placeholder="cole os comentários principais" className="sm:col-span-2" />
                    </fieldset>

                    {/* Resultado */}
                    {item.status === "pronto" && item.preview && (
                      <div className="grid gap-4 sm:grid-cols-2">
                        {item.preview.mosaicoUrl && (
                          <div>
                            <p className="text-xs font-medium text-secondary mb-1">MOSAICO (1 quadro por segundo) — clique para ampliar</p>
                            <img
                              src={item.preview.mosaicoUrl} alt="Mosaico do vídeo"
                              className="w-full rounded-md border cursor-zoom-in bg-black"
                              onClick={() => setZoom(item.preview!.mosaicoUrl!)}
                            />
                          </div>
                        )}
                        <div>
                          <div className="flex items-center justify-between mb-1">
                            <p className="text-xs font-medium text-secondary">
                              TRANSCRIÇÃO {item.preview.temFala ? "" : "— conferir: pode não ter fala"}
                            </p>
                            {item.preview.transcricao && (
                              <Button size="sm" variant="ghost" className="h-7" onClick={() => copy(item.preview!.transcricao!)}>
                                <Copy className="w-3.5 h-3.5 mr-1" /> Copiar
                              </Button>
                            )}
                          </div>
                          <pre className="text-xs bg-gray-50 border rounded-md p-3 max-h-64 overflow-auto whitespace-pre-wrap font-mono">
                            {item.preview.transcricao ?? (settings.transcribe ? "Sem trilha de áudio." : "Transcrição desligada neste lote.")}
                          </pre>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {items.length === 0 && (
          <Card>
            <CardContent className="pt-6 text-sm text-secondary space-y-1">
              <p className="font-medium text-gray-900">O que sai em cada pacote</p>
              <p>frames/ com um quadro a cada 0,125 s (nome com o tempo, ex.: 0001_00m00,000s.webp), mosaico de 1 quadro por segundo com o segundo escrito, capa.jpg, audio.wav, transcricao.txt com tempos, legendas.srt, legenda.txt, comentarios.txt e LEIA-ME.txt.</p>
              <p>Os vídeos são processados um de cada vez. Ao final, "Baixar tudo num zip" junta todos numa pasta só com um LEIA-ME geral.</p>
            </CardContent>
          </Card>
        )}
      </main>

      {zoom && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4 cursor-zoom-out" onClick={() => setZoom(null)}>
          <img src={zoom} alt="Mosaico ampliado" className="max-w-full max-h-full" />
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: Status }) {
  const styles: Record<Status, string> = {
    aguardando: "bg-gray-100 text-gray-700",
    enviando: "bg-blue-50 text-blue-700",
    processando: "bg-amber-50 text-amber-700",
    pronto: "bg-green-50 text-green-700",
    erro: "bg-red-50 text-red-700",
  };
  const Icon = status === "pronto" ? CheckCircle2 : status === "erro" ? AlertCircle
    : status === "aguardando" ? FileVideo : Loader2;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium", styles[status])}>
      <Icon className={cn("w-3.5 h-3.5", (status === "enviando" || status === "processando") && "animate-spin")} />
      {statusLabel[status]}
    </span>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Area({ label, value, onChange, placeholder, className }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string;
}) {
  return (
    <div className={cn("space-y-1", className)}>
      <Label className="text-xs">{label}</Label>
      <Textarea value={value} placeholder={placeholder} rows={3} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

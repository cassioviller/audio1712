import { Link, useLocation } from "wouter";
import { Film, Mic } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "/", label: "Pacote de estudo", icon: Film },
  { href: "/transcrever", label: "Só transcrever", icon: Mic },
];

export function AppHeader() {
  const [location] = useLocation();
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center text-white">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">AudioScript</h1>
            <p className="text-sm text-secondary">Referências de vídeo do canal A obra por dentro em 3D</p>
          </div>
        </div>
        <nav className="flex gap-1 bg-gray-100 rounded-lg p-1" aria-label="Seções">
          {tabs.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors",
                  active ? "bg-white text-gray-900 shadow-sm" : "text-secondary hover:text-gray-900",
                )}
                data-testid={`nav-${href === "/" ? "pacote" : "transcrever"}`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

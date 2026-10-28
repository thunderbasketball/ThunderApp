"use client";

import { useEffect, useRef, useState } from "react";

const DEVICES = {
  phone: { label: "Phone", width: 390, height: 844 },
  tablet: { label: "Tablet", width: 820, height: 1180 },
  desktop: { label: "Desktop", width: 1440, height: 900 },
} as const;
type Device = keyof typeof DEVICES;

const PAGES = [
  { label: "Home", path: "/" },
  { label: "Teams", path: "/teams" },
  { label: "Practice", path: "/practice" },
  { label: "Users", path: "/users" },
  { label: "Players", path: "/players" },
  { label: "Coaches", path: "/coaches" },
];

// The app in a frame at a real device size, shrunk to fit the screen. Links inside it work as usual.
export default function DevicePreview() {
  const [device, setDevice] = useState<Device>("phone");
  const [turned, setTurned] = useState(false);
  const [src, setSrc] = useState("/");
  const [reloads, setReloads] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [room, setRoom] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setRoom(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const d = DEVICES[device];
  const width = turned ? d.height : d.width;
  const height = turned ? d.width : d.height;
  const scale = room ? Math.min(1, room / width) : 1;

  // Keep the page the frame is on when switching size or reloading.
  const here = () => {
    try {
      const loc = frame.current?.contentWindow?.location;
      if (loc) return loc.pathname + loc.search;
    } catch {}
    return src;
  };

  const pill = (on: boolean) =>
    `rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
      on ? "bg-thunder-blue text-white shadow-sm" : "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-full bg-zinc-100 p-1 dark:bg-zinc-900">
          {(Object.keys(DEVICES) as Device[]).map((k) => (
            <button key={k} type="button" className={pill(device === k)} onClick={() => setDevice(k)}>
              {DEVICES[k].label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setTurned(!turned)}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-600 ring-1 ring-zinc-950/10 hover:bg-zinc-100 dark:text-zinc-300 dark:ring-white/15 dark:hover:bg-zinc-800"
        >
          ⟳ {turned ? "Portrait" : "Landscape"}
        </button>
        <select
          value=""
          onChange={(e) => {
            if (!e.target.value) return;
            setSrc(e.target.value);
            setReloads((n) => n + 1);
          }}
          className="rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-zinc-950/10 dark:bg-zinc-900 dark:ring-white/15"
        >
          <option value="">Go to page…</option>
          {PAGES.map((p) => (
            <option key={p.path} value={p.path}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => {
            setSrc(here());
            setReloads((n) => n + 1);
          }}
          className="rounded-full px-3 py-1.5 text-sm font-medium text-zinc-600 ring-1 ring-zinc-950/10 hover:bg-zinc-100 dark:text-zinc-300 dark:ring-white/15 dark:hover:bg-zinc-800"
        >
          Reload
        </button>
        <span className="text-xs text-zinc-500">
          {width} × {height}
          {scale < 1 && ` · shown at ${Math.round(scale * 100)}%`}
        </span>
      </div>

      <div ref={box} className="w-full">
        <div className="mx-auto overflow-hidden rounded-[1.75rem] bg-zinc-900 p-2 shadow-lg" style={{ width: width * scale + 16, height: height * scale + 16 }}>
          <iframe
            key={reloads}
            ref={frame}
            src={src}
            title={`${d.label} preview`}
            className="origin-top-left rounded-[1.25rem] bg-white"
            style={{ width, height, transform: `scale(${scale})` }}
          />
        </div>
      </div>
    </div>
  );
}

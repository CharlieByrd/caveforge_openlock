import { useRenderStore } from '../../store/render';

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}

function Slider({ label, value, min, max, step = 1, unit = '', onChange }: SliderProps) {
  return (
    <label className="render-slider">
      <span className="render-slider-label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Number(e.target.value))}
      />
      <span className="render-slider-val">{value}{unit}</span>
    </label>
  );
}

function SliderK({ label, valueK, min, max, onChange }: {
  label: string; valueK: number; min: number; max: number; onChange: (k: number) => void;
}) {
  return (
    <label className="render-slider">
      <span className="render-slider-label">{label}</span>
      <input type="range" min={min} max={max} step={1} value={valueK} onChange={e => onChange(Number(e.target.value))} />
      <span className="render-slider-val">{valueK}k</span>
    </label>
  );
}

export function RenderBar() {
  const { contrast, brightness, saturation, ambient, dirLight, fogDensity, maxTriangles, set, reset } = useRenderStore();

  return (
    <div className="render-bar">
      <Slider label="Contrast"   value={contrast}   min={50}  max={250} unit="%" onChange={v => set({ contrast: v })} />
      <Slider label="Brightness" value={brightness}  min={20}  max={200} unit="%" onChange={v => set({ brightness: v })} />
      <Slider label="Saturation" value={saturation}  min={0}   max={200} unit="%" onChange={v => set({ saturation: v })} />
      <div className="render-bar-sep" />
      <Slider label="Ambient"    value={Math.round(ambient * 100)}   min={0}   max={200} onChange={v => set({ ambient: v / 100 })} />
      <Slider label="Depth"      value={Math.round(dirLight * 100)}  min={0}   max={400} onChange={v => set({ dirLight: v / 100 })} />
      <Slider label="Fog"        value={Math.round(fogDensity * 1000)} min={0} max={120} onChange={v => set({ fogDensity: v / 1000 })} />
      <div className="render-bar-sep" />
      <SliderK label="Decimation" valueK={Math.round(maxTriangles / 1000)} min={100} max={1000} onChange={k => set({ maxTriangles: k * 1000 })} />
      <button className="render-reset" onClick={reset} title="Reset to defaults">↺</button>
    </div>
  );
}

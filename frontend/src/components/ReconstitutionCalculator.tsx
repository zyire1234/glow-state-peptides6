import React, { useState } from 'react';
import { HelpCircle, Calculator, ChevronRight, Check } from 'lucide-react';

export const ReconstitutionCalculator: React.FC = () => {
  const [vialSize, setVialSize] = useState<number>(5); // mg
  const [waterVolume, setWaterVolume] = useState<number>(2); // mL
  const [desiredDose, setDesiredDose] = useState<number>(0.25); // mg
  const [syringeType, setSyringeType] = useState<number>(100); // 100 units = 1cc/mL, 50 units = 0.5cc/mL

  // Calculations (all in mg)
  const mgPerML = vialSize / waterVolume;

  // Volume needed in mL
  const volumeNeededML = desiredDose / mgPerML;

  // Syringe units (100 units per 1mL)
  const syringeUnits = volumeNeededML * 100;

  // Syringe mark description
  const getSyringeMarks = () => {
    if (syringeUnits > syringeType) {
      return 'Dose exceeds syringe capacity. Add more water to the vial or use a larger syringe.';
    }
    return `Draw up to the ${syringeUnits.toFixed(1)} unit mark on a ${syringeType}-unit syringe.`;
  };

  return (
    <div className="bg-white/5 border border-white/10 rounded-2xl p-6 md:p-8 max-w-2xl mx-auto shadow-xl backdrop-blur-sm relative overflow-hidden">
      <div className="absolute top-0 right-0 w-24 h-24 bg-purple-600/5 blur-3xl pointer-events-none" />
      <div className="flex items-center gap-3 mb-6 relative z-10">
        <div className="p-3 bg-purple-500/15 text-purple-400 rounded-xl border border-purple-500/25">
          <Calculator className="h-6 w-6" />
        </div>
        <div>
          <h2 className="font-display font-bold text-xl md:text-2xl text-white uppercase tracking-wider">Peptide Reconstitution Calculator</h2>
          <p className="text-slate-400 text-xs">Calculate precise dosage dilution parameters for research vials.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 relative z-10">
        {/* Inputs */}
        <div className="space-y-4">
          <div>
            <label className="block text-slate-300 text-sm font-medium mb-1.5 flex justify-between">
              <span>Vial Size (mg)</span>
              <span className="text-purple-400 text-xs font-mono">{vialSize} mg</span>
            </label>
            <input
              type="range"
              min="1"
              max="15"
              step="1"
              value={vialSize}
              onChange={(e) => setVialSize(parseFloat(e.target.value))}
              className="w-full accent-purple-500 bg-[#0a0a25]/60 rounded-lg appearance-none h-2"
            />
            <div className="flex justify-between text-slate-500 text-[10px] mt-1 font-mono">
              <span>1mg</span>
              <span>5mg</span>
              <span>10mg</span>
              <span>15mg</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-medium mb-1.5 flex justify-between">
              <span>Bacteriostatic Water Added (mL)</span>
              <span className="text-blue-400 text-xs font-mono">{waterVolume} mL</span>
            </label>
            <input
              type="range"
              min="1"
              max="5"
              step="0.5"
              value={waterVolume}
              onChange={(e) => setWaterVolume(parseFloat(e.target.value))}
              className="w-full accent-blue-500 bg-[#0a0a25]/60 rounded-lg appearance-none h-2"
            />
            <div className="flex justify-between text-slate-500 text-[10px] mt-1 font-mono">
              <span>1mL</span>
              <span>2mL</span>
              <span>3mL</span>
              <span>4mL</span>
              <span>5mL</span>
            </div>
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-medium mb-1.5 flex justify-between">
              <span>Desired Dose (mg)</span>
              <span className="text-pink-400 text-xs font-mono">{desiredDose} mg</span>
            </label>
            <input
              type="number"
              step="0.01"
              value={desiredDose}
              onChange={(e) => setDesiredDose(Math.max(0, parseFloat(e.target.value) || 0))}
              className="w-full bg-[#0a0a25]/60 border border-white/10 rounded-xl px-4 py-2 text-white font-mono focus:outline-none focus:border-purple-500"
            />
            <p className="text-[10px] text-slate-500 mt-1">Common doses: 0.25mg, 0.5mg, 1mg.</p>
          </div>

          <div>
            <label className="block text-slate-300 text-sm font-medium mb-1.5">Syringe Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSyringeType(100)}
                className={`py-2 px-3 rounded-xl border text-center text-xs font-medium transition-all cursor-pointer ${
                  syringeType === 100
                    ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                100 Unit (1.0 mL)
              </button>
              <button
                type="button"
                onClick={() => setSyringeType(50)}
                className={`py-2 px-3 rounded-xl border text-center text-xs font-medium transition-all cursor-pointer ${
                  syringeType === 50
                    ? 'bg-purple-600/20 border-purple-500/40 text-purple-300'
                    : 'bg-white/5 border-white/10 text-slate-400 hover:border-white/20'
                }`}
              >
                50 Unit (0.5 mL)
              </button>
            </div>
          </div>
        </div>

        {/* Output */}
        <div className="bg-black/40 border border-white/10 rounded-2xl p-5 flex flex-col justify-between">
          <div>
            <h4 className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-4">Calculation Output</h4>
            
            <div className="space-y-4">
              <div>
                <span className="text-slate-400 text-[11px] block">Concentration:</span>
                <span className="text-white font-mono text-lg font-bold">
                  {mgPerML.toFixed(2)} mg / mL
                </span>
              </div>

              <div>
                <span className="text-slate-400 text-[11px] block">Draw Volume:</span>
                <span className="text-white font-mono text-lg font-bold">
                  {volumeNeededML.toFixed(3)} mL
                </span>
              </div>

              <div className="bg-gradient-to-br from-purple-950/30 to-blue-950/30 border border-purple-800/30 rounded-xl p-4 mt-2">
                <span className="text-purple-300 text-xs block mb-1">Required Syringe Amount:</span>
                <span className="text-white font-mono text-3xl font-extrabold text-glow-purple bg-gradient-to-r from-purple-400 to-blue-400 bg-clip-text text-transparent">
                  {syringeUnits.toFixed(1)} <span className="text-lg font-bold">Units</span>
                </span>
                <p className="text-slate-400 text-xs mt-2 leading-relaxed">
                  {getSyringeMarks()}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-white/10 text-slate-500 text-[10px] leading-relaxed flex gap-2">
            <HelpCircle className="h-4 w-4 text-purple-400 shrink-0" />
            <span>
              Always practice sterile laboratory research standards. Clean peptide vial and water caps with isopropyl alcohol before reconstitution. Keep refrigerated.
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white/5 border border-white/10 rounded-xl p-4 relative z-10">
        <h4 className="font-medium text-white text-sm mb-2">Example Reconstitution Guide:</h4>
        <ul className="space-y-1 text-slate-400 text-xs">
          <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> Adding 2mL water to a 5mg BPC-157 vial yields 2.5mg per 1mL.</li>
          <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> A desired dose of 0.25mg is exactly 0.1mL or 10 Units.</li>
          <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-emerald-400" /> A desired dose of 0.5mg is exactly 0.2mL or 20 Units.</li>
        </ul>
      </div>
    </div>
  );
};

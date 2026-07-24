import React from "react";
import { Button } from "../../../../components/ui/button";

export const MainContentSection = (): JSX.Element => {
  return (
    <section className="w-full h-[106px] flex fixed top-4 left-0 right-0 z-50">
      <div className="h-[76px] flex-1 flex items-center">
        <nav className="h-[76px] mx-auto max-w-[996px] w-full relative bg-[#0d0d26] rounded-2xl overflow-hidden flex items-center justify-between px-8">
          <img
            className="w-[140px] h-auto"
            alt="Scalers Logo"
            src="/Logo Scalers (3) (1).png"
          />

          <Button
            className="w-auto h-14 px-8 gap-[5px] bg-[#712ede] rounded-[10px] overflow-hidden shadow-[inset_4px_4px_25.4px_#ffffff33] hover:bg-[#712ede]/90 border-0 relative"
            onClick={() => window.open('https://www.skool.com/community-di-scalers-8843/classroom', '_blank')}
          >
            <div className="absolute -top-[86px] -left-[60px] w-[71px] h-[129px] rotate-[30deg] blur-[5px] [background:radial-gradient(50%_50%_at_50%_50%,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_100%)]" />

            <div className="flex items-center justify-center [font-family:'Manrope',Helvetica] font-semibold text-white text-base tracking-[0] leading-6 whitespace-nowrap relative z-10">
              Join Free Community
            </div>
          </Button>

          <div className="absolute w-full h-full top-0 left-0 rounded-2xl border border-solid border-[#1b1b4b] pointer-events-none" />
        </nav>
      </div>
    </section>
  );
};

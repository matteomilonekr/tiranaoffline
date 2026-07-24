import React from "react";
import { CurriculumSection } from "./sections/CurriculumSection";
import { FooterSection } from "./sections/FooterSection";
import { HeroSection } from "./sections/HeroSection";
import { InstructorSection } from "./sections/InstructorSection";
import { LearningObjectivesSection } from "./sections/LearningObjectivesSection";
import { MainContentSection } from "./sections/MainContentSection";
import { OverviewSection } from "./sections/OverviewSection";
import { ProblemSection } from "./sections/ProblemSection";
import { SolutionSection } from "./sections/SolutionSection";
import { StudentReviewsSection } from "./sections/StudentReviewsSection";

export const ElementLight = (): JSX.Element => {
  return (
    <div className="relative w-full min-h-screen bg-[linear-gradient(0deg,rgba(0,0,24,1)_0%,rgba(0,0,24,1)_100%),linear-gradient(0deg,rgba(255,255,255,1)_0%,rgba(255,255,255,1)_100%)]">
      <div className="relative w-full bg-[#000018]">
        <div className="absolute inset-x-0 top-0 h-[240px] pointer-events-none">
          <img
            className="absolute left-0 top-0 w-[45vw] max-w-[640px] h-auto -translate-y-[10px] -rotate-12 opacity-90"
            alt="Abstract left"
            src="/light-ray-1.svg"
          />
          <img
            className="absolute right-0 top-0 w-[45vw] max-w-[640px] h-auto -translate-y-[10px] rotate-12 opacity-90"
            alt="Abstract right"
            src="/light-ray-2.svg"
          />
        </div>

        <MainContentSection />

        <div className="relative w-full">
          <HeroSection />
          <ProblemSection />
          <SolutionSection />
          <CurriculumSection />
          <LearningObjectivesSection />
          <InstructorSection />
          <StudentReviewsSection />
          <section className="w-full py-24 bg-[#000018]">
            <div className="max-w-3xl mx-auto px-8 text-center flex flex-col items-center gap-8">
              <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight tracking-tight">
                Entra gratis nella community Scalers
              </h2>
              <p className="text-lg text-gray-400 max-w-xl leading-relaxed">
                Post, risorse, workshop live e confronto diretto con altri professionisti che usano l'AI ogni giorno.
              </p>
              <a
                href="https://www.skool.com/community-di-scalers-8843"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-3 bg-[#D4FF40] text-black font-bold text-sm uppercase tracking-wider px-8 py-4 hover:bg-white transition-colors"
              >
                Iscriviti gratis →
              </a>
            </div>
          </section>
          <OverviewSection />
        </div>

        <FooterSection />
      </div>
    </div>
  );
};

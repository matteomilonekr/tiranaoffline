import React from "react";
import { Card, CardContent } from "../../../../components/ui/card";

const problemCards = [
  {
    icon: "/icon-container-11.svg",
    title: "Want to Monetize AI?",
    description:
      "You want to monetize AI but don't know where to start or what to offer clients.",
  },
  {
    icon: "/icon-container-8.svg",
    title: "Theory Over Practice?",
    description:
      "Other courses teach theory, not real client deliverables you can sell immediately.",
  },
  {
    icon: "/icon-container-6.svg",
    title: "Trading Time for Money?",
    description: "You're stuck trading time for money with no scalable system or recurring revenue.",
  },
  {
    icon: "/icon-container-9.svg",
    title: "Automation Feels Complex?",
    description:
      "Automation and AI feel overwhelming and too technical to get started confidently.",
  },
];

export const ProblemSection = (): JSX.Element => {
  return (
    <section className="w-full flex flex-col gap-[60px] py-12">
      <div className="flex flex-col gap-[9.6px]">
        <h2 className="[font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] text-[58px] text-center tracking-[0] leading-[69.6px]">
          The Problem: You're Stuck
        </h2>

        <div className="flex flex-col gap-[3px] items-center">
          <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg text-center tracking-[0] leading-[27px]">
            These frustrations are holding back thousands of aspiring AI entrepreneurs.
          </p>

          <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg text-center tracking-[0] leading-[27px]">
            Sound familiar? You're about to breakthrough every single one.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-5">
        <div className="flex flex-col gap-5">
          {problemCards.slice(0, 2).map((card, index) => (
            <Card
              key={index}
              className="bg-[#0b0b1e] rounded-2xl border-[#141439] overflow-hidden"
            >
              <CardContent className="p-[30px] flex flex-col gap-6">
                <img
                  className="w-[46px] h-[46px]"
                  alt="Icon container"
                  src={card.icon}
                />

                <div className="flex flex-col gap-[7px]">
                  <h3 className="[font-family:'Manrope',Helvetica] font-bold text-white text-xl tracking-[0] leading-6">
                    {card.title}
                  </h3>

                  <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-base tracking-[0] leading-6">
                    {card.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="row-span-2">
          <div className="h-full rounded-2xl bg-[url(/yz8aeaem13zn95ggosruzxkwsq-png.png)] bg-cover bg-[50%_50%] border border-solid border-[#141439]" />
        </div>

        <div className="flex flex-col gap-5">
          {problemCards.slice(2, 4).map((card, index) => (
            <Card
              key={index}
              className="bg-[#0b0b1e] rounded-2xl border-[#141439] overflow-hidden"
            >
              <CardContent className="p-[30px] flex flex-col gap-6">
                <img
                  className="w-[46px] h-[46px]"
                  alt="Icon container"
                  src={card.icon}
                />

                <div className="flex flex-col gap-[7px]">
                  <h3 className="[font-family:'Manrope',Helvetica] font-bold text-white text-xl tracking-[0] leading-6">
                    {card.title}
                  </h3>

                  <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-base tracking-[0] leading-6">
                    {card.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
};

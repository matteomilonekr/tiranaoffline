import React from "react";
import { Card, CardContent } from "../../../../components/ui/card";

const solutionCards = [
  {
    icon: "/icon-container-7.svg",
    lightRay: "/light-ray-2.svg",
    title: "8 Ready-to-Sell Projects",
    description:
      "Complete automation projects valued €500-€12K each, ready to deliver.",
  },
  {
    icon: "/icon-container-10.svg",
    lightRay: "/light-ray-3.svg",
    title: "Complete Business System",
    description:
      "Not just tutorials - full client acquisition and delivery frameworks.",
  },
  {
    icon: "/icon-container-13.svg",
    lightRay: "/light-ray-1.svg",
    title: "First Client Framework",
    description:
      "Proven system to land your first paying client in 30-90 days guaranteed.",
  },
  {
    icon: "/icon-container-5.svg",
    lightRay: "/light-ray.svg",
    title: "€22K-€100K+ Portfolio",
    description:
      "Build enterprise-grade portfolio with real market value depending on tier.",
  },
];

export const SolutionSection = (): JSX.Element => {
  return (
    <section className="w-full flex items-center py-20">
      <div className="container mx-auto px-8 max-w-[1400px] flex gap-8">
        <div className="w-[438px] h-[605.59px] flex rounded-[20px] bg-[url(/ktvqrjf771azdkidhnfr51cv8s-png.png)] bg-cover bg-[50%_50%] flex-shrink-0">
          <div className="flex-1 w-[438px] rounded-[20px] border border-solid border-[#141439]" />
        </div>

        <div className="flex-1 flex flex-col">
          <div className="flex flex-col gap-[13.6px] mb-[50px]">
            <h2 className="text-5xl leading-[57.6px] [font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] tracking-[0]">
              The Scalers Solution
            </h2>

            <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg tracking-[0] leading-[27px]">
              Our proven system transforms these roadblocks into your
              <br />
              competitive advantage. Here&#39;s exactly what you get.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-5">
            {solutionCards.map((card, index) => (
              <Card
                key={index}
                className="bg-[#0b0b1e] rounded-2xl border-[#141439] overflow-hidden min-h-[240px]"
              >
                <CardContent className="relative w-full h-full p-7">
                  <img
                    className="absolute w-[52.00%] top-0 right-0 h-[193px] opacity-80"
                    alt="Light ray"
                    src={card.lightRay}
                  />

                  <img
                    className="w-[46px] h-[46px] mb-6"
                    alt="Icon container"
                    src={card.icon}
                  />

                  <div className="relative z-10 flex flex-col gap-3">
                    <h3 className="[font-family:'Manrope',Helvetica] font-bold text-white text-xl tracking-[0] leading-tight">
                      {card.title}
                    </h3>

                    <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#d0d0d0] text-[15px] tracking-[0] leading-relaxed">
                      {card.description}
                    </p>
                  </div>

                  <div className="absolute w-full h-full top-0 left-0 rounded-2xl border border-solid border-[#141439] pointer-events-none" />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

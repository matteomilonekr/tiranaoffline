import React from "react";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";

const featureBadges = [
  {
    icon: "/icon---pwjwkoltb7pkblaa96tq3a9rida-png.png",
    text: "First Client in 30-90 Days",
  },
  {
    icon: "/icon---pwjwkoltb7pkblaa96tq3a9rida-png-1.png",
    text: "8 Ready-to-Sell Projects",
  },
  {
    icon: "/icon---pwjwkoltb7pkblaa96tq3a9rida-png-2.png",
    text: "€22K-€100K+ Portfolio Value",
  },
];

export const HeroSection = (): JSX.Element => {
  return (
    <section className="w-full flex flex-col gap-20 pb-20 pt-[130px]">
      <div className="flex flex-col gap-20 flex-1">
        <div className="mx-auto max-w-[996px] flex flex-col gap-10">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-center gap-2 h-10">
              <img
                className="h-10 w-32"
                alt="Profile images"
                src="/profile-images.svg"
              />

              <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                  <img
                    className="h-3.5 w-16"
                    alt="Stars"
                    src="/stars---xgi8scf8uihnrosr5xcg3u8poi-svg.svg"
                  />
                  <span className="[font-family:'Manrope',Helvetica] font-semibold text-[#f2f2f2] text-sm tracking-[0] leading-[14px] whitespace-nowrap">
                    4.9 / 5
                  </span>
                </div>
                <span className="[font-family:'Manrope',Helvetica] font-semibold text-[#b5b2b1] text-sm tracking-[0] leading-[14px] whitespace-nowrap">
                  From 500+ Students
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-5">
              <div className="flex flex-col items-center">
                <h1 className="[font-family:'Manrope',Helvetica] font-bold text-white text-[68px] text-center tracking-[0] leading-[81.6px] whitespace-nowrap">
                  Transform Your Skills Into
                </h1>
                <h1 className="[font-family:'Manrope',Helvetica] font-bold text-white text-[68px] text-center tracking-[0] leading-[81.6px] whitespace-nowrap">
                  €10K+/Month AI Automation
                </h1>
              </div>

              <div className="flex flex-col items-center gap-[3px] mx-auto max-w-[584px]">
                <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#b5b2b1] text-lg text-center tracking-[0] leading-[27px]">
                  Scalers isn't another coding bootcamp. It's your fast-track to
                </p>
                <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#b5b2b1] text-lg text-center tracking-[0] leading-[27px]">
                  building a profitable AI automation business in 90 days or less.
                </p>
              </div>
            </div>
          </div>

          <div className="flex justify-center">
            <Button
              className="h-[59px] w-auto px-8 bg-[#712ede] hover:bg-[#5f25bc] rounded-[10px] shadow-[inset_4px_4px_25.4px_#ffffff33] relative overflow-hidden"
              onClick={() => window.open('https://www.skool.com/community-di-scalers-8843/classroom', '_blank')}
            >
              <div className="absolute -top-[86px] -left-[60px] w-[71px] h-[129px] rotate-[30deg] blur-[5px] [background:radial-gradient(50%_50%_at_50%_50%,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_100%)]" />
              <span className="[font-family:'Manrope',Helvetica] font-semibold text-white text-lg tracking-[0] leading-[27px] whitespace-nowrap relative z-10">
                Join Free Community
              </span>
            </Button>
          </div>
        </div>

        <div className="mx-auto max-w-[1260px] w-full relative">
          <div className="absolute w-[60%] top-[-180px] left-[20%] h-[296px] bg-[#712ede] rounded-[130px] blur-[42.5px]" />

          <div className="relative flex justify-center gap-6 mb-12">
            {featureBadges.map((badge, index) => (
              <Badge
                key={index}
                variant="secondary"
                className="h-6 bg-transparent border-none rounded-[100px] overflow-hidden px-0"
              >
                <img
                  className="w-[22px] h-[22px] bg-cover bg-center"
                  alt="Icon"
                  src={badge.icon}
                />
                <span className="ml-2 [font-family:'Manrope',Helvetica] font-semibold text-[#b5b2b1] text-base tracking-[0] leading-6 whitespace-nowrap">
                  {badge.text}
                </span>
              </Badge>
            ))}
          </div>

          <img
            className="absolute w-[55%] top-[-89px] left-[22.5%] h-[231px] pointer-events-none"
            alt="Particles mask group"
            src="/particles-mask-group.svg"
          />

          <div className="relative mx-[30px]">
            <img
              className="w-full h-auto"
              alt="Video container"
              src="/video-container.svg"
            />
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[1260px] w-full relative h-20">
        <img
          className="absolute top-0 left-[30px] w-[499px] h-20"
          alt="Ticker container"
          src="/ticker-container.svg"
        />

        <div className="absolute top-[26px] left-[569px] h-[29px] flex items-center overflow-hidden">
          <span className="[font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] text-2xl tracking-[0] leading-[28.8px] whitespace-nowrap">
            Trusted by
          </span>
        </div>

        <img
          className="absolute top-0 left-[731px] w-[499px] h-20"
          alt="Ticker container"
          src="/ticker-container-1.svg"
        />
      </div>
    </section>
  );
};

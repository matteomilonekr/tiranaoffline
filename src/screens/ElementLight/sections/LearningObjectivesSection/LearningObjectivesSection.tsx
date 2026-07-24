import React from "react";
import { Card, CardContent } from "../../../../components/ui/card";

const objectives = [
  {
    icon: "/icon-container-16.svg",
    title: "Build Professional Websites from Scratch",
    description:
      "Create stunning, responsive websites for any business without relying on templates or copying designs.",
  },
  {
    icon: "/icon-container-12.svg",
    title: "Command Premium Rates for Your Skills",
    description:
      "Price your services confidently and attract high-paying clients who value quality web design and user experience.",
  },
  {
    icon: "/icon-container-15.svg",
    title: "Launch Your Freelance Web Design Business",
    description:
      "Earn $50–150/hr as a freelance web designer with confidence to handle client projects professionally.",
  },
  {
    icon: "/icon-container-14.svg",
    title: "Build a Portfolio That Impresses Everyone",
    description:
      "Showcase 5+ professional websites that demonstrate your expertise and win more clients than you can handle.",
  },
  {
    icon: "/icon-container-17.svg",
    title: "Work From Anywhere in the World",
    description:
      "Break free from the 9-to-5 grind and work remotely from coffee shops, beaches, or your dream destination.",
  },
  {
    icon: "/icon-container-1.svg",
    title: "Create Websites That Actually Convert",
    description:
      "Design high-performing websites that generate leads, sales, and results for your clients' businesses.",
  },
];

export const LearningObjectivesSection = (): JSX.Element => {
  return (
    <section className="w-full flex flex-col gap-[60px] py-8">
      <header className="flex flex-col gap-[9.6px]">
        <h2 className="text-[58px] text-center leading-[69.6px] [font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] tracking-[0]">
          Your Life After This Course
        </h2>

        <div className="flex flex-col items-center gap-[3px] mx-auto max-w-[700px]">
          <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg text-center tracking-[0] leading-[27px]">
            Imagine having the skills, confidence, and portfolio to completely
            transform your
          </p>
          <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg text-center tracking-[0] leading-[27px]">
            career. Here's what becomes possible when you master web design
          </p>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-8">
        {objectives.map((objective, index) => (
          <Card
            key={index}
            className="backdrop-blur-[1.28px] backdrop-brightness-[100%] [-webkit-backdrop-filter:blur(1.28px)_brightness(100%)] bg-[#0b0b1e] rounded-2xl border border-solid border-[#141439] overflow-hidden"
          >
            <CardContent className="p-[30px] flex flex-col gap-[23px]">
              <div className="flex gap-2 items-center">
                <img
                  className="h-[46px] w-[46px]"
                  alt="Icon container"
                  src={objective.icon}
                />
                <h3 className="[font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] text-xl tracking-[0] leading-6">
                  {objective.title}
                </h3>
              </div>
              <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg tracking-[0] leading-[27px]">
                {objective.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};

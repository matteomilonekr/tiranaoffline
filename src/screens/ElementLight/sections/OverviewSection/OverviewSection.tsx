import React from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "../../../../components/ui/accordion";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent } from "../../../../components/ui/card";

const faqItems = [
  {
    id: "item-1",
    question: "Do I need any prior experience or coding knowledge?",
    answer:
      "Absolutely not! This course starts from the very basics. Over 80% of our students had zero coding experience when they started.",
    defaultOpen: true,
  },
  {
    id: "item-2",
    question: "How long does it take to complete the course?",
    answer: "",
    defaultOpen: false,
  },
  {
    id: "item-3",
    question: "What if I get stuck or need help?",
    answer: "",
    defaultOpen: false,
  },
  {
    id: "item-4",
    question: "Can I build a full-time career from this?",
    answer: "",
    defaultOpen: false,
  },
  {
    id: "item-5",
    question: "Can I really get freelance clients after this course?",
    answer: "",
    defaultOpen: false,
  },
  {
    id: "item-6",
    question: "What's your refund policy?",
    answer: "",
    defaultOpen: false,
  },
];

export const OverviewSection = (): JSX.Element => {
  return (
    <section className="w-full flex items-center py-24">
      <div className="container mx-auto px-8 max-w-[1260px]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="flex flex-col gap-12">
            <div className="flex flex-col gap-2">
              <h2 className="[font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] text-5xl tracking-[0] leading-[57.6px]">
                Common Questions
              </h2>

              <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg tracking-[0] leading-[27px]">
                Got questions? We've got answers. Here are the most <br />
                common questions from students before they transform <br />
                their careers with web design.
              </p>
            </div>

            <Card className="bg-[#0b0b1e] border-[#141439] rounded-2xl overflow-hidden">
              <CardContent className="p-8 flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <h3 className="[font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] text-2xl tracking-[0] leading-[28.8px]">
                    Ready to Start Building?
                  </h3>

                  <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-base tracking-[0] leading-6">
                    Don't wait another day to transform your career. Join <br />
                    +2K students already mastering AI automation with our <br />
                    proven system.
                  </p>
                </div>

                <Button
                  className="w-fit h-auto bg-[#712ede] hover:bg-[#5f25bc] rounded-[10px] px-6 py-4 shadow-[inset_4px_4px_25.4px_#ffffff33] relative overflow-hidden"
                  onClick={() => window.open('https://www.skool.com/community-di-scalers-8843/classroom', '_blank')}
                >
                  <div className="absolute top-[-86px] left-[-60px] w-[71px] h-[129px] rotate-[30deg] blur-[5px] [background:radial-gradient(50%_50%_at_50%_50%,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_100%)]" />
                  <span className="[font-family:'Manrope',Helvetica] font-semibold text-white text-lg tracking-[0] leading-[27px] relative z-10">
                    Join Free Community
                  </span>
                </Button>
              </CardContent>
            </Card>
          </div>

          <div className="flex flex-col gap-5">
            <Accordion
              type="single"
              collapsible
              defaultValue="item-1"
              className="flex flex-col gap-5"
            >
              {faqItems.map((item) => (
                <AccordionItem
                  key={item.id}
                  value={item.id}
                  className="bg-[#0b0b1e] rounded-2xl border border-[#141439] overflow-hidden px-6 py-7 data-[state=open]:pb-6"
                >
                  <AccordionTrigger className="[font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] text-lg tracking-[0] leading-[23.4px] text-left hover:no-underline py-0">
                    {item.question}
                  </AccordionTrigger>
                  {item.answer && (
                    <AccordionContent className="[font-family:'Manrope',Helvetica] font-semibold text-[#999999] text-base tracking-[0] leading-[22.4px] pt-4 pb-0">
                      {item.answer}
                    </AccordionContent>
                  )}
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </div>
      </div>
    </section>
  );
};

import React from "react";
import { Badge } from "../../../../components/ui/badge";
import { Button } from "../../../../components/ui/button";
import { Card, CardContent } from "../../../../components/ui/card";

const pricingPlans = [
  {
    title: "START",
    description: "Perfect for beginners - First €500 client in 30 days",
    price: "49",
    priceType: "/month",
    buttonText: "Start 7-Day Free Trial",
    featuresTitle: "What's Included:",
    features: [
      "N8N Foundations (20 lessons, 15-20 hours)",
      "3 Sellable Projects (€500-€1.5K each)",
      "50 n8n Workflow Templates",
      "Copy for Advertising (Modules 1-3)",
      "Personal Branding Essentials",
      "GHL Single Account License",
      "Vault: 50+ SaaS Discounts (€2K/year value)",
      "Super Bundle: 15 Landing Pages",
    ],
  },
  {
    title: "PREMIUM",
    description: "Scale to €3-5K/month - Complete automation business",
    price: "1,499",
    priceType: "/year",
    buttonText: "Scale to €5K/Month",
    featuresTitle: "Everything in START, Plus:",
    features: [
      "N8N Complete (65 lessons, 55-60 hours)",
      "All 8 Sellable Projects (€500-€12K range)",
      "150 Advanced n8n Workflows",
      "100+ Claude Code AI Agents",
      "8 Complete Courses (Email, Funnel, UGC)",
      "ALiCE IAI LinkedIn Ghostwriter (DIY)",
      "Portfolio Value: €22K-€33K",
    ],
  },
  {
    title: "ACCELERATE",
    description: "Build your agency - €10-20K+/month with white-label",
    price: "2,499",
    priceType: "/year",
    buttonText: "Book Strategy Call",
    featuresTitle: "Everything in PREMIUM, Plus:",
    features: [
      "250+ Enterprise n8n Workflows",
      "Meta Agent OS + MCP Ecosystem",
      "AI Voice Agent + Resale License",
      "scaleUGC Complete System (€1.5K value)",
      "Complete Agency Bundle",
      "2x 1-on-1 Strategy Sessions",
      "Private Mastermind Access",
      "White-Label Rights (Voice AI + UGC)",
    ],
  },
];

const guaranteeBadges = [
  {
    text: "Lifetime Updates Included",
  },
  {
    text: "Community Access",
  },
];

export const PricingSection = (): JSX.Element => {
  return (
    <section className="w-full flex flex-col gap-[60px] py-12">
      <header className="flex flex-col gap-[9.6px]">
        <h2 className="text-[58px] text-center leading-[69.6px] [font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] tracking-[0]">
          3 Tiers - One Goal: Financial Freedom
        </h2>

        <div className="flex flex-col gap-[3px] items-center mx-auto">
          <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg text-center tracking-[0] leading-[27px]">
            Choose your starting point based on where you are now.
          </p>
          <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg text-center tracking-[0] leading-[27px]">
            Every tier is designed to get you to your first paying clients fast.
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-[30px]">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-[30px]">
          {pricingPlans.map((plan, index) => (
            <Card
              key={index}
              className="bg-[#0b0b1e] rounded-[20px] border-[#141439] overflow-hidden"
            >
              <CardContent className="p-[30px] flex flex-col gap-[30px]">
                <div className="flex flex-col gap-[30px]">
                  <div className="flex flex-col gap-2">
                    <h3 className="[font-family:'Manrope',Helvetica] font-bold text-white text-2xl tracking-[0] leading-[28.8px]">
                      {plan.title}
                    </h3>
                    <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#b5b2b1] text-lg tracking-[0] leading-[27px]">
                      {plan.description}
                    </p>
                  </div>

                  <div className="flex gap-[1.7px] items-end">
                    <span className="[font-family:'Manrope',Helvetica] font-semibold text-white text-[15px] tracking-[0] leading-[21px]">
                      $
                    </span>
                    <span className="[font-family:'Manrope',Helvetica] font-bold text-white text-5xl tracking-[0] leading-[57.6px]">
                      {plan.price}
                    </span>
                    <span className="[font-family:'Manrope',Helvetica] font-semibold text-[#b5b2b1] text-lg tracking-[0] leading-[27px] ml-1">
                      {plan.priceType}
                    </span>
                  </div>
                </div>

                <Button
                  className="h-auto bg-[#712ede] hover:bg-[#5f25bc] rounded-[10px] py-4 px-6 shadow-[inset_4px_4px_25.4px_#ffffff33] relative overflow-hidden"
                  onClick={() => {
                    if (index === 0) {
                      window.open('https://www.skool.com/community-di-scalers-8843/classroom', '_blank');
                    } else {
                      window.open('https://www.skool.com/community-di-scalers-paid/', '_blank');
                    }
                  }}
                >
                  <div className="absolute top-[-86px] left-[-60px] w-[71px] h-[129px] rotate-[30deg] blur-[5px] [background:radial-gradient(50%_50%_at_50%_50%,rgba(255,255,255,0.2)_0%,rgba(255,255,255,0)_100%)]" />
                  <span className="[font-family:'Manrope',Helvetica] font-semibold text-white text-lg tracking-[0] leading-[27px] relative z-10">
                    {plan.buttonText}
                  </span>
                </Button>

                <div className="flex flex-col gap-4 mt-[22px]">
                  <h4 className="[font-family:'Manrope',Helvetica] font-semibold text-white text-lg tracking-[0] leading-[27px]">
                    {plan.featuresTitle}
                  </h4>

                  <ul className="flex flex-col gap-3">
                    {plan.features.map((feature, featureIndex) => (
                      <li
                        key={featureIndex}
                        className="flex items-center gap-[7px]"
                      >
                        <img
                          className="w-[9px] h-[10px] flex-shrink-0"
                          alt="Tick icon"
                          src="/tick-icon---aysmjrurm2nqxc5z2eburuq7ok-svg.svg"
                        />
                        <span className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-base tracking-[0] leading-6">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap justify-center gap-3">
          {guaranteeBadges.map((badge, index) => (
            <Badge
              key={index}
              variant="outline"
              className="h-auto bg-[#0b0b1e] rounded-[100px] border-[#141439] px-3 py-2 flex items-center gap-2"
            >
              <img
                className="w-[22px] h-[22px]"
                alt="Badge icon"
                src="/vvjxsm2dzsymp4wu2mzvoqlue8q-svg.svg"
              />
              <span className="[font-family:'Manrope',Helvetica] font-semibold text-[#b5b2b1] text-[15px] tracking-[0] leading-[21px] whitespace-nowrap">
                {badge.text}
              </span>
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
};

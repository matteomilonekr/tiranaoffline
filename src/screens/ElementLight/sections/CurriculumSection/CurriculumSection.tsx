import { ChevronDownIcon } from "lucide-react";
import React from "react";

const modules = [
  {
    id: 1,
    number: "Project 1",
    duration: "€500-€800",
    title: "Email Auto-Responder System",
    isExpanded: true,
    lessons: [
      {
        number: "1",
        title: "N8N Setup & Configuration",
        duration: "15 min",
      },
      {
        number: "2",
        title: "Email Trigger Integration",
        duration: "20 min",
      },
      {
        number: "3",
        title: "AI Response Generation",
        duration: "25 min",
      },
      { number: "4", title: "Client Delivery & Deployment", duration: "30 min" },
    ],
  },
  {
    id: 2,
    number: "Project 2",
    duration: "€1.2K-€1.5K",
    title: "Customer Feedback Collection Agent",
    isExpanded: false,
    lessons: [],
  },
  {
    id: 3,
    number: "Project 3",
    duration: "€800-€1K",
    title: "Telegram Chatbot Integration",
    isExpanded: false,
    lessons: [],
  },
  {
    id: 4,
    number: "Project 4",
    duration: "€1.5K-€2K",
    title: "Data Processing & Analysis Agent",
    isExpanded: false,
    lessons: [],
  },
  {
    id: 5,
    number: "Project 5",
    duration: "€2.5K-€3.5K",
    title: "Lead Qualification System",
    isExpanded: false,
    lessons: [],
  },
  {
    id: 6,
    number: "Project 6",
    duration: "€3K-€5K",
    title: "RAG Knowledge Base Implementation",
    isExpanded: false,
    lessons: [],
  },
  {
    id: 7,
    number: "Project 7",
    duration: "€5K-€8K",
    title: "Voice AI Agent System",
    isExpanded: false,
    lessons: [],
  },
  {
    id: 8,
    number: "Project 8",
    duration: "€8K-€12K",
    title: "SuperAgent Multi-Agent Orchestration",
    isExpanded: false,
    lessons: [],
  },
];

export const CurriculumSection = (): JSX.Element => {
  return (
    <section className="w-full relative flex gap-[224px]">
      <div className="flex-shrink-0">
        <div className="flex flex-col gap-[7.6px]">
          <h2 className="[font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] text-5xl tracking-[0] leading-[57.6px] whitespace-nowrap">
            What You'll Build
          </h2>
          <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg tracking-[0] leading-[27px]">
            8 ready-to-sell automation projects with real market value. <br />
            Each project is designed to be sold to actual clients <br />
            for €500-€12K depending on complexity.
          </p>
        </div>
      </div>

      <div className="flex-1 flex flex-col gap-5">
        {modules.map((module) => (
          <div
            key={module.id}
            className="relative bg-[#0b0b1e] rounded-2xl overflow-hidden border border-solid border-[#141439]"
          >
            <div className="relative">
              <div className="px-6 py-6 flex items-center justify-between border-b border-solid border-[#141439]">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center gap-2.5">
                    <span className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-[15px] tracking-[0] leading-[21px] whitespace-nowrap">
                      {module.number}
                    </span>
                    <div className="h-1 w-1 bg-[#94969d] rounded" />
                    <span className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-[15px] tracking-[0] leading-[21px] whitespace-nowrap">
                      {module.duration}
                    </span>
                  </div>
                  <h3 className="[font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] text-lg tracking-[0] leading-[21.6px] whitespace-nowrap">
                    {module.title}
                  </h3>
                </div>
                <button className="w-8 h-8 flex items-center justify-center">
                  <ChevronDownIcon
                    className={`w-5 h-5 text-[#94969d] transition-transform ${
                      module.isExpanded ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </div>

              {module.isExpanded && module.lessons.length > 0 && (
                <div className="px-6 py-4 flex flex-col gap-4">
                  {module.lessons.map((lesson, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between"
                    >
                      <div className="flex items-center gap-[7.7px]">
                        <span className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-base tracking-[0] leading-6 whitespace-nowrap">
                          {lesson.number}
                        </span>
                        <span className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-base tracking-[0] leading-6 whitespace-nowrap">
                          {lesson.title}
                        </span>
                      </div>
                      <span className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-base tracking-[0] leading-6 whitespace-nowrap">
                        {lesson.duration}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

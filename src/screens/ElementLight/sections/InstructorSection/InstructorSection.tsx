import React from "react";

export const InstructorSection = (): JSX.Element => {
  return (
    <section className="w-full flex gap-[60px] px-4">
      <div className="w-full max-w-[514px] h-[540px] flex rounded-[20px] bg-[url(/replicate-prediction-kq99nnwhvnrm80cta01r7bpdp8.webp)] bg-cover bg-[50%_50%]">
        <div className="flex-1 w-full rounded-[20px] border border-solid border-[#141439]" />
      </div>

      <div className="flex-1 flex flex-col justify-center gap-[73.59px]">
        <div className="flex flex-col gap-[17px]">
          <div className="flex flex-col gap-[3px]">
            <div className="[font-family:'Manrope',Helvetica] font-semibold text-[#b5b2b1] text-lg tracking-[0] leading-[27px]">
              Meet Your Instructor
            </div>

            <h2 className="[font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] text-[58px] tracking-[0] leading-[69.6px]">
              Matteo Milone
            </h2>
          </div>

          <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg tracking-[0] leading-[27px]">
            I built my first AI automation business to €10K/month in 8 months.
            Then I <br />
            realized: the systems I built are worth more when I teach them.
            Scalers is <br />
            everything I wish I had when I started. The exact frameworks,
            workflows, and <br />
            strategies that got me to €10K+/month. No theory. No fluff. Just
            proven systems <br />
            that make money. Whether you're starting at zero or scaling to
            €10K+/month, <br />
            Scalers has the roadmap. See you inside.
          </p>
        </div>

        <a
          href="https://www.linkedin.com/in/matteo-milone/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 [font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-base leading-6 hover:text-[#f2f2f2] transition-colors"
        >
          <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
            <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
          </svg>
          LinkedIn
        </a>
      </div>
    </section>
  );
};

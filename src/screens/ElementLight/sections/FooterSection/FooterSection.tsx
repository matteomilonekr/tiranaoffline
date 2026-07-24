import { ExternalLinkIcon } from "lucide-react";
import React from "react";


const socialMediaLinks = [
  { text: "LinkedIn", url: "https://www.linkedin.com/in/matteo-milone/" },
];

export const FooterSection = (): JSX.Element => {
  return (
    <footer className="w-full bg-[#0b0b1e] border-t border-[#141439]">
      <div className="max-w-[1260px] mx-auto px-6 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-8 mb-10">
          <div className="flex flex-col gap-6">
            <img
              className="w-[272px] h-[47px]"
              alt="Scalers Logo"
              src="/Logo Scalers (3) (1).png"
            />

            <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#b5b2b1] text-base leading-6 max-w-[436px]">
              Transform your skills into a €10K+/month AI automation <br />
              business. 8 ready-to-sell projects, complete business system, and proven <br />
              frameworks to land clients in 30-90 days.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 lg:gap-[244px]">
            <div className="flex flex-col gap-5">
              <h3 className="[font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] text-xl leading-6">
                Social Media
              </h3>

              <nav className="flex flex-col gap-3">
                {socialMediaLinks.map((link, index) => (
                  <a
                    key={index}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2.5 [font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-base leading-6 hover:text-[#f2f2f2] transition-colors"
                  >
                    {link.text}
                    <ExternalLinkIcon className="h-4 w-4" />
                  </a>
                ))}
              </nav>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-6 border-t border-[#141439]">
          <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-base leading-6">
            © 2025 Scalers. All rights reserved.
          </p>

          <div className="flex flex-col gap-1">
            <span className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-sm leading-5">
              Issued by Scalers Ltd
            </span>
            <span className="[font-family:'Manrope',Helvetica] font-normal text-[#94969d] text-sm leading-5">
              63-66 Hatton Garden Fifth Floor, Suite 23
            </span>
            <span className="[font-family:'Manrope',Helvetica] font-normal text-[#94969d] text-sm leading-5">
              London EC1N 8LE
            </span>
            <span className="[font-family:'Manrope',Helvetica] font-normal text-[#94969d] text-sm leading-5">
              United Kingdom
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

import React from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "../../../../components/ui/avatar";
import { Card, CardContent } from "../../../../components/ui/card";

const reviewsData = [
  {
    text: "You're great, Matteo. I really admire what you do, but above all, how you do it — always with a smile.",
    avatar: "/e6ucrzxvatyeuteodcih3bozkxm-png.png",
    name: "Mattia Pastrello",
    role: "Student",
  },
  {
    text: "I don't want to sound like a flatterer or sycophant, far from it — but I'm truly delighted by your 'work' and your way of working. Congratulations.",
    avatar: "/zohoetoftfslj4a1fddgqmtli-png.png",
    name: "Mattia Pastrello",
    role: "Student",
  },
  {
    text: "My God, Matteo… you're scary good, you're truly the GOAT in Italy as far as I'm concerned… obviously interested in your process :)",
    avatar: "/ktcduh7iuizcd07cf6ctmmuam-png.png",
    name: "Marco Famà",
    role: "Student",
  },
  {
    text: "I just wrote my first article with Claude Code. I'm shocked… 5000 words using my tone of voice, my phrases, my expressions. I still need to perfect Claude.md, but I'm already blown away.",
    avatar: "/vfupd1qnhtvr1ag0qqopo73tzw0-png.png",
    name: "Luigi Virginio",
    role: "Student",
  },
  {
    text: "I have no idea how you manage to produce all the material you share. And for free, on top of that. Mind-blowing 🤯",
    avatar: "/pnwi2egd4d84g81hy1ld7s5ups-png.png",
    name: "Giuseppe Bisemi",
    role: "Student",
  },
  {
    text: "I had never seen a line of code in my life before Matte and his bomb of Claude Code arrived! It's incredible. Only room for creativity. Matteo, really, all thanks to you!",
    avatar: "/rzy1jvzrabummlzcqmo4175q9ha-png.png",
    name: "Rosario Giammellaro",
    role: "Student",
  },
  {
    text: "My goodness, what content! I devoured it all — no one right now does what you do. I find what you're doing really interesting and I'd love to implement it in my own field.",
    avatar: "/ji8kna4yhk6ybchvk4aqlzs25q-png.png",
    name: "Simone La Rosa",
    role: "Student",
  },
  {
    text: "I love this place. This space. Truly valuable content. Filtered at the source and almost embarrassingly valuable for being free. A unique place that anyone serious about growing in this field should frequent. <3",
    avatar: "/djcxtogqirw8b8tb1evhk2vbh8s-png.png",
    name: "Mirko Falleri",
    role: "Student",
  },
  {
    text: "If there were more creators with your spirit, we'd already be on another planet 🚀",
    avatar: "/e6ucrzxvatyeuteodcih3bozkxm-png.png",
    name: "Elia Anchise",
    role: "Student",
  },
  {
    text: "Thank you for everything you do… so much value… you're the best.",
    avatar: "/zohoetoftfslj4a1fddgqmtli-png.png",
    name: "Gianni Albanese",
    role: "Student",
  },
  {
    text: "There's a reason why months ago I created a folder with all of Matteo's materials! Always the best ⭐⭐⭐⭐⭐",
    avatar: "/ktcduh7iuizcd07cf6ctmmuam-png.png",
    name: "Niccolò Gianotto",
    role: "Student",
  },
];

export const StudentReviewsSection = (): JSX.Element => {
  return (
    <section className="w-full flex flex-col gap-[60px] py-12">
      <header className="flex flex-col gap-[9.6px] max-w-[850px] mx-auto">
        <h2 className="text-[58px] text-center leading-[69.6px] [font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] tracking-[0]">
          What Our Community Is Saying
        </h2>

        <div className="flex flex-col items-center gap-[3px]">
          <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg text-center tracking-[0] leading-[27px]">
            Real feedback from real people transforming their skills into
          </p>

          <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#94969d] text-lg text-center tracking-[0] leading-[27px]">
            profitable AI automation businesses.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[26px]">
        {reviewsData.map((review, index) => (
          <Card
            key={index}
            className="bg-[#0b0b1e] rounded-2xl border border-solid border-[#141439] overflow-hidden"
          >
            <CardContent className="p-[30px] flex flex-col gap-[26px]">
              <p className="[font-family:'Manrope',Helvetica] font-semibold text-[#b5b2b1] text-xl tracking-[0] leading-[30px] min-h-[117px]">
                {review.text}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Avatar className="h-[50px] w-[50px] rounded-full border border-solid border-[#141439]">
                    <AvatarImage
                      src={review.avatar}
                      alt={review.name}
                      className="object-cover"
                    />
                    <AvatarFallback className="bg-[#0b0b1e] text-[#f2f2f2]">
                      {review.name
                        .split(" ")
                        .map((n) => n[0])
                        .join("")}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex flex-col gap-0.5">
                    <div className="[font-family:'Manrope',Helvetica] font-bold text-[#f2f2f2] text-base tracking-[0] leading-6">
                      {review.name}
                    </div>

                    <div className="[font-family:'Manrope',Helvetica] font-semibold text-[#b5b2b1] text-sm tracking-[0] leading-[14px]">
                      {review.role}
                    </div>
                  </div>
                </div>

                <img
                  className="w-[81px] h-[14px]"
                  alt="Rating"
                  src="/gks4b2xdimbidhxtfsdvb9wuxew-svg.svg"
                />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
};

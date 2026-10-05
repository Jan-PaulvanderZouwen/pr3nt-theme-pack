"use client";

import { useState } from "react";
import { BookOpen, Download, Play } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { guideMarkdown, helpGuides } from "@/lib/help";

export default function HelpCenter({
  open,
  onOpenChange,
  onStartTour,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStartTour: () => void;
}) {
  const [selected, setSelected] = useState(helpGuides[0].id);
  const guide =
    helpGuides.find((item) => item.id === selected) || helpGuides[0];

  function downloadGuide() {
    const url = URL.createObjectURL(
      new Blob([guideMarkdown(guide)], { type: "text/markdown;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `bouwr-uitleg-${guide.id}.md`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="app-dialog help-dialog">
        <DialogHeader>
          <DialogTitle>Even op weg helpen.</DialogTitle>
          <DialogDescription>
            Praktische uitleg voor jouw werkplek. Lees een handleiding of loop
            samen door het portaal.
          </DialogDescription>
        </DialogHeader>
        <div className="help-actions">
          <button className="primary" onClick={onStartTour}>
            <Play size={15} /> Start de rondleiding
          </button>
          <span>
            <BookOpen size={15} /> 6 handleidingen
          </span>
        </div>
        <div className="help-layout">
          <nav
            className="help-topics"
            aria-label="Onderwerpen van de handleiding"
          >
            {helpGuides.map((item, index) => (
              <button
                key={item.id}
                aria-current={selected === item.id ? "page" : undefined}
                onClick={() => setSelected(item.id)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                {item.title}
              </button>
            ))}
          </nav>
          <article
            key={guide.id}
            className="help-article"
            aria-labelledby="help-article-title"
          >
            <header>
              <h2 id="help-article-title">{guide.title}</h2>
              <p>{guide.description}</p>
            </header>
            <ol className="help-steps">
              {guide.sections.map((section) => (
                <li key={section.title}>
                  <h3>{section.title}</h3>
                  <p>{section.text}</p>
                </li>
              ))}
            </ol>
            <aside className="help-note">
              <b>Goed om te weten</b>
              <p>{guide.note}</p>
            </aside>
            <button className="outline" onClick={downloadGuide}>
              <Download size={15} /> Download deze uitleg
            </button>
          </article>
        </div>
      </DialogContent>
    </Dialog>
  );
}

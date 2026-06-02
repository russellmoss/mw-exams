import Link from "next/link";
import { getChapterIndex } from "@/lib/learning-units";

export const dynamic = "force-static";

export default function LearnIndexPage() {
  const chapters = getChapterIndex();

  return (
    <div className="flex flex-col flex-1">
      <header className="border-b border-border">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <h1 className="text-2xl font-bold text-foreground tracking-tight">Learn</h1>
          <p className="text-sm text-muted mt-1">
            How the practical is actually passed — study chapters grounded in the exam record.
          </p>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-4xl mx-auto px-6 py-8">
          {chapters.length === 0 ? (
            <p className="text-sm text-muted">No chapters published yet.</p>
          ) : (
            <div className="space-y-3">
              {chapters.map((ch) => (
                <Link
                  key={ch.slug}
                  href={`/learn/${ch.slug}`}
                  className="block bg-card rounded-xl border border-border p-5 hover:border-accent/50 transition-colors group"
                >
                  <div className="flex items-baseline gap-3 mb-1.5">
                    <span className="text-xs font-semibold text-accent tabular-nums">
                      Chapter {ch.chapter}
                    </span>
                    {ch.status !== "published" && (
                      <span className="text-[0.6rem] uppercase tracking-wide text-borderline border border-borderline/40 rounded-full px-2 py-0.5">
                        {ch.status}
                      </span>
                    )}
                    {ch.estReadingMinutes && (
                      <span className="text-xs text-muted ml-auto">≈ {ch.estReadingMinutes} min</span>
                    )}
                  </div>
                  <h2 className="text-lg font-semibold text-foreground group-hover:text-accent transition-colors">
                    {ch.title}
                  </h2>
                  {ch.subtitle && <p className="text-sm text-muted mt-0.5">{ch.subtitle}</p>}
                  <p className="text-sm text-muted/90 leading-relaxed mt-2 line-clamp-3">{ch.summary}</p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

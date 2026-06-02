import { notFound } from "next/navigation";
import { getChapter, getChapterIndex } from "@/lib/learning-units";
import { ChapterReader } from "@/app/components/learn/ChapterReader";

export const dynamic = "force-static";

export function generateStaticParams() {
  return getChapterIndex().map((c) => ({ slug: c.slug }));
}

export default async function ChapterPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const chapter = getChapter(slug);
  if (!chapter) notFound();
  return <ChapterReader chapter={chapter} />;
}

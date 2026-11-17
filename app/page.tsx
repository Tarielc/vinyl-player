import { MusicApp } from "@/components/MusicApp";

export default function Home({ searchParams }: PageProps<"/">) {
  // The hero renders statically; the OAuth return params are read inside it, behind Suspense.
  return <MusicApp searchParams={searchParams} />;
}

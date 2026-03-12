"use client";

import dynamic from "next/dynamic";

// React Flow needs to be loaded client-side only
const Canvas = dynamic(() => import("@/components/Canvas"), { ssr: false });

export default function Home() {
  return <Canvas />;
}

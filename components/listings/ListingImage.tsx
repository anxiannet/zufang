"use client";

import Image from "next/image";
import { Home } from "lucide-react";
import { useState } from "react";

export function ListingImage({
  src,
  alt,
  priority = false,
  sizes,
  className = "object-cover",
  external = false
}: {
  src?: string | null;
  alt: string;
  priority?: boolean;
  sizes: string;
  className?: string;
  external?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="subtle-grid flex h-full w-full flex-col items-center justify-center bg-gradient-to-br from-teal-50 to-slate-100 text-brand/70">
        <Home className="h-9 w-9" strokeWidth={1.5} />
        <span className="mt-2 text-xs font-semibold">图片待补充</span>
      </div>
    );
  }

  if (external) {
    return (
      // External candidate images can come from changing source domains.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className={`h-full w-full ${className}`}
        loading={priority ? "eager" : "lazy"}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      className={className}
      priority={priority}
      sizes={sizes}
      onError={() => setFailed(true)}
    />
  );
}

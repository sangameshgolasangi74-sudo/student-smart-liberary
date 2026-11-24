import { useState } from 'react';
import { BookOpen } from 'lucide-react';

interface BookCoverImageProps {
  src?: string;
  title: string;
  author?: string;
  className?: string;
  dark?: boolean;
}

export function BookCoverImage({ src, title, author, className = '', dark = false }: BookCoverImageProps) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div
        className={`flex flex-col justify-between p-4 select-none ${
          dark
            ? 'bg-[#1E1E1E] border border-[#2F2F2F] text-[#F7F5EF]'
            : 'bg-[#EEEAE1] border border-[#D8D1C5] text-[#171717]'
        } ${className}`}
      >
        <div className="flex items-center justify-between">
          <span className="text-[10px] tracking-[0.18em] uppercase text-[#C6A66B] font-medium">Athenaeum</span>
          <BookOpen className="w-4 h-4 text-[#C6A66B]" />
        </div>
        <div className="my-auto py-3">
          <p className="font-serif text-sm font-semibold leading-snug line-clamp-3">{title}</p>
          {author && <p className="mt-1.5 text-xs opacity-70 truncate">{author}</p>}
        </div>
        <div className="h-px w-full bg-[#C6A66B]/30" />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={`Cover of ${title}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`object-cover ${className}`}
    />
  );
}

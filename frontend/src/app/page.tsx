import Link from 'next/link';
import { HomeSearch } from '@/components/home/home-search';
import { Container } from '@/components/layout/container';
import { MapIcon, PenIcon } from '@/components/ui';

/** Static home page: the search comes first, then the two other things the product does. */
export default function HomePage() {
  return (
    <>
      <section className="bg-ink pb-16 text-ink-inverse sm:pb-20">
        <Container className="pt-12 sm:pt-16">
          <h1 className="max-w-3xl font-display text-5xl leading-[0.95] font-bold tracking-tight sm:text-7xl">
            Book the flight. Book the room. Plan the days in between.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-ink-inverse/75">
            Search real seats and rooms, pay securely, and keep every trip&rsquo;s plan and budget in one place.
          </p>
          <div className="mt-10">
            <HomeSearch />
          </div>
        </Container>
      </section>

      <Container className="grid gap-10 py-14 sm:grid-cols-2">
        <Link href="/itineraries/explore" className="group flex gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand-ink">
            <MapIcon className="size-5" />
          </span>
          <span>
            <span className="block text-lg font-semibold group-hover:text-brand">Plan a trip day by day</span>
            <span className="mt-1 block text-ink-soft">
              Cities, activities and a budget that adds itself up. Copy a public trip and make it yours.
            </span>
          </span>
        </Link>
        <Link href="/blog" className="group flex gap-4">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-signal-soft text-signal-ink">
            <PenIcon className="size-5" />
          </span>
          <span>
            <span className="block text-lg font-semibold group-hover:text-brand">Read where people went</span>
            <span className="mt-1 block text-ink-soft">
              Stories, tips and photos from other travellers, searchable by place and tag.
            </span>
          </span>
        </Link>
      </Container>
    </>
  );
}

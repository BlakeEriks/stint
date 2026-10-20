import { Loader } from '@/components/loader';
import { Page } from '@/components/page';

/**
 * What a section shows the moment its tab is pressed (Constitution VI),
 * while a route that isn't static does its server work.
 */
export default function Loading() {
  return (
    <Page>
      <Loader />
    </Page>
  );
}

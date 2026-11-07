import { Page } from '@/components/shell/Page';
import { Placeholder } from '@/components/placeholder/Placeholder';
import { Eyebrow, Meta } from '@/components/type/Type';

export default function HomePage() {
  return (
    <Page
      railLabel="Agent activity"
      rail={
        <>
          <Eyebrow large>Agent activity</Eyebrow>
          <Meta>The agent feed arrives with Home in Phase C.</Meta>
        </>
      }
    >
      <Placeholder title="Home" phase="Phase C · Batch 1" frames="2c, 2h, states 3a to 3j" />
    </Page>
  );
}

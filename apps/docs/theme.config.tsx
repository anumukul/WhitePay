import type { DocsThemeConfig } from 'nextra-theme-docs';
import { DocsSearch } from './components/search';
const config: DocsThemeConfig = {
  search: { component: DocsSearch },
  logo: (
    <strong>
      WhitePay <small> / Developer docs</small>
    </strong>
  ),
  project: { link: 'https://github.com/anumukul/WhitePay' },
  docsRepositoryBase:
    'https://github.com/anumukul/WhitePay/tree/main/apps/docs',
  footer: { content: 'Whitechain Sepolia · Testnet only · Public alpha' },
};
export default config;

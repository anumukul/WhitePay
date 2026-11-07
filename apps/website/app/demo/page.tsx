import { Header } from '../../components/header';
import { ProofViewer } from './proof-viewer';
export const metadata = { title: 'WhitePay — Historical payment proof' };
export default function Demo() {
  return (
    <>
      <Header />
      <main className="wrap">
        <div className="page-intro">
          <p className="eyebrow">A real transaction, explained</p>
          <h1>
            One checkout.
            <br />
            Both sides of the receipt.
          </h1>
          <p className="lead">
            Explore the confirmed widget payment. These are historical verified
            results, not a new checkout, simulation or current balance query.
          </p>
        </div>
        <ProofViewer />
      </main>
    </>
  );
}

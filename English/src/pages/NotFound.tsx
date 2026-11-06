import { ButtonLink, EmptyState, useDocumentTitle } from '../components/ui';

export default function NotFound() {
  useDocumentTitle('Not found');
  return <EmptyState title="Page not found" body="This page doesn't exist. Let's get you back on track." action={<ButtonLink to="/">Go to Today</ButtonLink>} />;
}

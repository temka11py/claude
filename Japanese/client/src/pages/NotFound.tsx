import { useI18n } from '../i18n';
import { EmptyState, LinkButton } from '../components/ui';

export default function NotFound() {
  const { L } = useI18n();
  return (
    <EmptyState
      icon={<span className="brush text-6xl text-shu">迷</span>}
      title={L('Хуудас олдсонгүй', 'Page not found')}
      body={L('Энэ хаяг байхгүй байна. Хяналтын самбар руу буцна уу.', 'This address does not exist. Head back to the dashboard.')}
      action={<LinkButton to="/">{L('Нүүр хуудас', 'Dashboard')}</LinkButton>}
    />
  );
}

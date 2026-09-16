import { statusLabel, statusTone } from '@/lib/presentation';

type Props = {
  status: string;
};

export default function StatusPill({ status }: Props) {
  const tone = statusTone(status);
  return (
    <span className={`pill is-${tone}`}>
      <span className={`led${tone === 'idle' ? '' : ` is-${tone}`}`} />
      {statusLabel(status)}
    </span>
  );
}

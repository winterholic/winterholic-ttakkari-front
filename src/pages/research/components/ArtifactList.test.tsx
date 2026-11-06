import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtifactList } from './ArtifactList';

const { downloadLink } = vi.hoisted(() => ({ downloadLink: vi.fn() }));
vi.mock('../../../api/client', () => ({ downloadLink, moveArtifact: vi.fn() }));
vi.mock('../../../features/viewer/hooks', () => ({ useBlobUrl: vi.fn() }));
vi.mock('../../../ui/toastStore', () => ({ toast: vi.fn() }));

describe('ArtifactList', () => {
  beforeEach(() => downloadLink.mockReset());
  afterEach(() => vi.restoreAllMocks());

  it('opens a tab during the click before the signed download URL resolves', async () => {
    let resolveLink!: (link: { url: string }) => void;
    downloadLink.mockReturnValue(new Promise(resolve => { resolveLink = resolve; }));
    const popup = { location: { href: 'about:blank' }, opener: window as Window | null, close: vi.fn() };
    const open = vi.spyOn(window, 'open').mockReturnValue(popup as unknown as Window);

    render(<ArtifactList artifacts={[{
      id: 'artifact-link', artifact_id: 'file-1', role: 'benchmark_table', label: '측정 표',
    }]} />);
    fireEvent.click(screen.getByRole('button', { name: '열기·내려받기' }));
    const callsBeforeLinkResolved = open.mock.calls.length;
    resolveLink({ url: 'https://files.example.test/signed' });
    await vi.waitFor(() => expect(open).toHaveBeenCalled());
    await vi.waitFor(() => expect(popup.location.href).toBe('https://files.example.test/signed'));
    expect(callsBeforeLinkResolved).toBe(1);
    expect(open).toHaveBeenCalledWith('about:blank', '_blank');
    expect(popup.opener).toBeNull();
  });
});

import type { Session } from '../types';

export interface SessionChain {
    id: string;
    sessions: Session[];
    chainOrder: number;
}

export function buildChains(sessions: Session[]): SessionChain[] {
    if (sessions.length === 0) return [];

    const nextIds = new Set(sessions.map((s) => s.nextSessionId).filter(Boolean) as string[]);

    // Roots are sessions that no other session points to via nextSessionId
    const roots = sessions.filter((s) => !nextIds.has(s.id));

    const chains: SessionChain[] = [];
    const visited = new Set<string>();

    for (const root of roots) {
        if (visited.has(root.id)) continue;

        const chain: Session[] = [];
        let current: Session | undefined = root;

        while (current && !visited.has(current.id)) {
            visited.add(current.id);
            chain.push(current);
            // Find the next session in the chain
            current = current.nextSessionId
                ? sessions.find((s) => s.id === current!.nextSessionId)
                : undefined;
        }

        chains.push({
            id: root.id,
            sessions: chain,
            chainOrder: root.sessionOrder,
        });
    }

    // Handle any circular references or orphaned sessions that weren't roots
    for (const s of sessions) {
        if (!visited.has(s.id)) {
            visited.add(s.id);
            chains.push({ id: s.id, sessions: [s], chainOrder: s.sessionOrder });
        }
    }

    // Sort chains by the physical order of the root session
    return chains.sort((a, b) => a.chainOrder - b.chainOrder);
}

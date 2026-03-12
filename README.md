# butterfly

A perpetual research engine that tracks the cascading effects of world events.

Give it a starting event — like the Strait of Hormuz being blocked — and it autonomously generates downstream questions, researches them, estimates probabilities, and propagates changes through a causal graph. An interactive infinite canvas lets you explore the growing research tree and steer it with annotations.

## How it works

**The engine runs in a loop:**

1. **Score** all open questions using a value system that balances exploration vs. exploitation — weighing uncertainty, downstream impact, novelty, staleness, and user interest
2. **Pick** the highest-priority question
3. **Research** it via Claude, producing a ~1000 word synthesis with evidence and follow-up questions
4. **Apply** results — update the node, create new downstream questions
5. **Propagate** probability changes through the graph (noisy-OR model)
6. **Repeat**

**The canvas lets you:**

- Watch the graph grow in real time with auto-layout
- Click any node to read the full research summary and evidence
- Add annotations (questions, nudges, insights) to steer the engine's priorities
- Drag nodes to rearrange the layout manually

## Setup

```bash
npm install
```

Add your Anthropic API key to `.env.local`:

```
ANTHROPIC_API_KEY=sk-ant-...
```

Run the dev server:

```bash
npm run dev
```

Open http://localhost:3000, click **Seed Scenario** to load the Hormuz blockade example, then **Run Continuous** to start the engine.

## Architecture

```
src/
├── engine/
│   ├── researcher.ts    # Claude-powered research + question generation
│   ├── prioritizer.ts   # Value system for picking what to research next
│   ├── propagator.ts    # Probability propagation through the graph
│   ├── graph.ts         # Graph operations (create nodes, apply results)
│   └── loop.ts          # Autonomous research loop
├── components/
│   ├── Canvas.tsx        # React Flow infinite canvas
│   ├── QuestionNode.tsx  # Question card component
│   ├── AnnotationNode.tsx
│   └── EvidencePanel.tsx # Side panel for research details + annotations
├── lib/
│   └── db.ts            # SQLite persistence
├── app/
│   └── api/             # Next.js API routes
├── types.ts
seeds/
└── hormuz-blockade.ts   # Example seed scenario
```

## License

MIT

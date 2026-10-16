# Nexus Swarm

Autonomous multi-robot disaster response and rescue coordination simulator. The predefined East Ward scenario runs immediately in the browser and includes drones, ground rovers, ambulances, rescue tasks, battery management, dynamic road closures, and live mission metrics.

## Run

Requirements: Node.js 20+ and npm.

```sh
npm install
npm run dev
```

Vite prints the local URL (normally `http://localhost:5173`). Create a production build with `npm run build`; serve it locally with `npm run preview`. Run the simulation engine tests with `npm test`.

## Architecture

This starter had no backend or application code, so the working fallback is a React/TypeScript client simulation. The simulation state, A* pathfinder, fixed simulation clock, task coordinator, and benchmark runner execute in `src/sim.ts`; the React dashboard and HTML canvas are views over that same state. NumPy is not running in the browser, and no Python service or undeclared external service is required. The optional 3D view is not implemented; the 2D view is the operational interface.

The map is a deterministic 26 × 18 grid. Road, open, rubble-cost, and blocked-building cells share one terrain model between routing and rendering. The three drone patrols and four initial victim locations are fixed, so a run can be repeated from Reset.

## Simulation model

- **A* routing:** Four-directional A* uses Manhattan distance as its heuristic. Buildings and active road closures are impassable; road cells cost 0.9, open cells 1, and rubble 2.2. Map changes trigger route replanning, and an unreachable destination remains visibly blocked.
- **Coordination:** Drone patrol cells reveal victims only when surveyed. Each report creates a priority task. Eligible idle rovers must have a route and enough estimated battery for travel, rescue service, a return route to charging, and the configured reserve. Coordinated scoring accounts for route length, rubble, battery, and priority. A priority-10 request may displace one lower-priority route when necessary; the displaced task is returned to the queue with a lock against repeated preemption.
- **Movement reservations:** Rovers propose moves on discrete steps. The coordinator reserves destination cells and rejects occupied-cell entry, duplicate reservations, and opposing edge swaps. Rejected moves increment the blocked-movement metric; actual collisions remain separately measured.
- **Battery:** Operating rovers lose one percentage point per configured simulated-time interval (default 16 seconds), independent of render frame rate. Low-battery warnings are separate from the critical return threshold. A critical rover releases its unfinished task, immediately requests reassignment, routes to the nearest reachable charger, and rejoins at 82% charge. Mechanical failure instead freezes the rover and releases its task without sending it to charge.
- **Rescue and transport:** A rover performs a timed assistance action at the victim. Available ambulances route to the pickup, wait for a short loading interval, then route to the medical centre. Event timestamps and response/transport durations use simulation time.
- **Baseline comparison:** The right panel runs two independent 900-second replays from the same initial map, units, patrols, and tasks. The baseline assigns the nearest feasible available rover; the coordinated strategy uses the score above. Distances, response times, completion rates, reassignment counts, and blocked moves are measured from those runs, not hard-coded. These are simulator estimates, not physical-robot results.

## Controls

Start, pause, resume, and reset are in the bottom bar. Change simulation speed in the top bar. Use Add Victim or Road Block, then click a valid grid cell; clicking an existing road block clears it. Urgent Call creates a priority-10 request. Fail Rover and Low Battery apply to the selected rover (or the first eligible rover when another unit is selected). Settings expose battery thresholds, discharge interval, reserve, charging rate, and rescue duration. Map controls toggle coordinates and routes, zoom, and pan by dragging.

## Tests and limitations

`npm test` covers A* reachability and terrain, drone discovery, end-to-end rover rescue and ambulance transport, cell and edge-swap conflict prevention, task failure reassignment, urgent preemption, critical battery handoff, obstacle replanning, fixed-time battery drain, pause behavior, and repeatable benchmark runs.

Known limits: the simulator is a deterministic grid-based demonstration rather than a physical dynamics model; ambulance routes use the shared traversable grid rather than road-only constraints; communication is represented as coordinator event messages and a nominal link state; collision prevention is discrete and conservative; and there is no backend, NumPy runtime, persistence, or 3D scene.
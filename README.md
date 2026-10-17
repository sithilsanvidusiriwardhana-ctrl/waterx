# waterX

Smart Plant Water Management System frontend demonstration.

## Run the dashboard

```powershell
cd frountend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the dashboard. Use **My Plants** in the sidebar or open [http://localhost:3000/plants](http://localhost:3000/plants) to manage plants. Select **View Details** on a plant to open its individual page. Plant configuration is saved in this browser's localStorage; sensor readings, watering history, growth measurements, and predictions are demonstration data where explicitly labelled, or unavailable until provided.

Settings are available at [http://localhost:3000/settings](http://localhost:3000/settings).

Production checks and startup:

```powershell
npm run lint
npm run build
npm start
```

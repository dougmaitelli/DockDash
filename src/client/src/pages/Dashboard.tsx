import { useDashboard } from "../hooks/useData";
import { DashboardCanvas } from "../components/dashboard/DashboardCanvas";
import { Page } from "../styles/Dashboard.styles";

export default function Dashboard() {
  const {
    services,
    links,
    refresh,
    updatePosition,
    addService,
    updateService,
    addLink,
    updateLink,
    removeLink,
    removeService,
  } = useDashboard();

  return (
    <Page>
      <DashboardCanvas
        services={services}
        links={links}
        refresh={refresh}
        updatePosition={updatePosition}
        addService={addService}
        updateService={updateService}
        addLink={addLink}
        updateLink={updateLink}
        removeLink={removeLink}
        removeService={removeService}
      />
    </Page>
  );
}

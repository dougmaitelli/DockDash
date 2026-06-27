import { DashboardCanvas } from "../components/dashboard/DashboardCanvas";
import { useServices } from "../hooks/useData";

export default function Dashboard() {
  const {
    services,
    links,
    loading,
    error,
    refresh,
    updatePosition,
    addService,
    updateService,
    addLink,
    updateLink,
    removeLink,
    removeService,
  } = useServices();

  return (
    <div className="p-6 h-[calc(100vh-56px)] flex flex-col gap-5">
      <DashboardCanvas
        services={services}
        links={links}
        loading={loading}
        error={error}
        refresh={refresh}
        updatePosition={updatePosition}
        addService={addService}
        updateService={updateService}
        addLink={addLink}
        updateLink={updateLink}
        removeLink={removeLink}
        removeService={removeService}
      />
    </div>
  );
}

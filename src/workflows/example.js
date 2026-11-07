// Replace this module with your application's collection and business logic.
// Session, transport, MDS/Smart-1 Cloud selection, pagination, and run-script
// handling belong to the framework and should remain outside domain workflows.
export async function runExampleWorkflow({ sessions, sessionId, context = "primary" }) {
  const objects = await sessions.list(sessionId, "show-gateways-and-servers", {}, context);
  return {
    summary: `Found ${objects.length} gateway and server objects.`,
    objects: objects.map(({ uid, name, type, ipv4Address, "ipv4-address": ipv4 }) => ({
      uid,
      name,
      type,
      ipv4Address: ipv4Address || ipv4 || ""
    }))
  };
}

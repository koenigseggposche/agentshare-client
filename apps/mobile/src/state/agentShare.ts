import { createAgentShareEnvironmentAtoms } from "@t3tools/client-runtime/state/agentShare";
import { connectionAtomRuntime } from "../connection/runtime";

export const agentShareEnvironment = createAgentShareEnvironmentAtoms(connectionAtomRuntime);

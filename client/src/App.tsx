import "./App.css";
import { Desktop } from "./components/desktop/Desktop";

interface NodeInfo {
  name: string;
  host: string;
  port: number;
  username: string;
  privateKeyPath: string;
  status?: "online" | "offline";
}

interface NewNodeForm {
  name: string;
  host: string;
  port: string;
  username: string;
  privateKeyPath: string;
}

interface StagingFile {
  name: string;
  size: number;
  lastModified: string;
}

function App() {
  // Desktop host - windows are children, not routes
  return <Desktop />;
  const [pushRemotePath, setPushRemotePath] = useState<string>("");
  const [stagingFiles, setStagingFiles] = useState<StagingFile[]>([]);
  const [wsLogs, setWsLogs] = useState<string[]>([]);

  const logEndRef = useRef<HTMLDivElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const wsUrl = useMemo(() => {
    const host = window.location.hostname || "loki";
    return `ws://${host}:3001`;
  }, []);

  const appendLog = (msg: string) => {
    setWsLogs((prev) => [...prev, msg]);
  };

  const fetchNodes = async () => {
    try {
      const response = await axios.get("/api/nodes");
      const list = Array.isArray(response.data)
        ? response.data
        : response.data.nodes || [];
      setNodes(list);
    } catch (error) {
      appendLog("Error: Could not fetch nodes.");
      console.error("Error fetching nodes:", error);
    }
  };

  const fetchStaging = async () => {
    try {
      const response = await axios.get<StagingFile[]>("/api/staging");
      setStagingFiles(response.data);
    } catch (error) {
      appendLog("Error: Could not fetch staging files.");
      console.error("Error fetching staging files:", error);
    }
  };

  const handleAddNode = (e: FormEvent) => {
    e.preventDefault();
    const nodeToAdd: NodeInfo = {
      ...newNode,
      port: parseInt(newNode.port, 10),
    };
    axios
      .post("/api/nodes", nodeToAdd)
      .then(() => {
        appendLog(`Node '${newNode.name}' added successfully.`);
        fetchNodes();
        setNewNode({
          name: "",
          host: "",
          port: "22",
          username: "",
          privateKeyPath: "",
        });
        setShowAddForm(false);
      })
      .catch((error) => {
        appendLog("Error: Failed to add node. Check server logs.");
        console.error("Error adding node:", error.response?.data || error.message);
      });
  };

  const handleDeleteNode = (nodeName: string) => {
    axios
      .delete(`/api/nodes/${nodeName}`)
      .then(() => {
        appendLog(`Node '${nodeName}' deleted successfully.`);
        fetchNodes();
        if (selectedNode === nodeName) {
          setSelectedNode("");
        }
      })
      .catch((error) => {
        appendLog(`Error: Failed to delete node '${nodeName}'.`);
        console.error("Error deleting node:", error);
      });
  };

  const executeWorkflow = () => {
    if (!selectedNode) {
      appendLog("Error: Please select a node to execute on.");
      return;
    }
    appendLog(`Executing workflow on node: ${selectedNode}...`);
    axios
      .post("/api/execute", { node: selectedNode, file: selectedFile })
      .then((response) => {
        appendLog(
          response.data.message ||
            `Execution started. ID: ${response.data.id || "unknown"}`,
        );
      })
      .catch((error) => {
        appendLog("Error: Failed to execute workflow.");
        console.error("Error executing workflow:", error);
      });
  };

  const handlePullFile = () => {
    if (!selectedNode || !pullRemotePath) {
      appendLog("Error: Select a node and provide a remote path to pull.");
      return;
    }
    appendLog(`Pulling ${pullRemotePath} from ${selectedNode}...`);
    axios
      .post("/api/pull", {
        node: selectedNode,
        remotePath: pullRemotePath,
        localName: pullLocalName || undefined,
      })
      .then(() => {
        appendLog("Pull successful (stored in server staging).");
        fetchStaging();
      })
      .catch((error) => {
        appendLog("Error: Pull failed.");
        console.error(error.response?.data || error.message);
      });
  };

  const handlePushFile = () => {
    if (!selectedNode || !pushLocalName || !pushRemotePath) {
      appendLog(
        "Error: Select a node and provide staging file name and destination path to push.",
      );
      return;
    }
    appendLog(`Pushing ${pushLocalName} to ${pushRemotePath} on ${selectedNode}...`);
    axios
      .post("/api/push", {
        node: selectedNode,
        localName: pushLocalName,
        remotePath: pushRemotePath,
      })
      .then(() => {
        appendLog("Push successful (from server staging).");
      })
      .catch((error) => {
        appendLog("Error: Push failed.");
        console.error(error.response?.data || error.message);
      });
  };

  useEffect(() => {
    fetchNodes();
    fetchStaging();
  }, []);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const label = msg.type || "message";
        const text = msg.message || msg.error || msg.command || "";
        appendLog(`[${label}] ${text}`);
      } catch (e) {
        appendLog(`[ws] ${event.data}`);
      }
    };
    ws.onclose = () => {
      appendLog("WebSocket disconnected.");
    };
    ws.onerror = (err) => {
      console.error("WebSocket error", err);
    };
    return () => {
      ws.close();
    };
  }, [wsUrl]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [wsLogs]);

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Prompt Forge</h1>
          <p>Orchestrate AI Workflows Across Multiple Nodes</p>
        </div>
        <div className="flex items-center gap-2">
          <p className="text-sm text-gray-400">WS:</p>
          <span className="px-2 py-1 rounded text-xs font-semibold bg-green-500">
            Connected
          </span>
        </div>
      </header>

      <main className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Panel 1: Execution Control + Add Node */}
        <section className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Execution Control</h2>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Target Node</label>
            <select
              value={selectedNode}
              onChange={(e) => setSelectedNode(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded p-2"
            >
              <option value="">Select a node...</option>
              {nodes.map((node) => (
                <option key={node.name} value={node.name}>
                  {node.name} ({node.host})
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Workflow File</label>
            <input
              type="text"
              value={selectedFile}
              onChange={(e) => setSelectedFile(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded p-2"
            />
          </div>

          <button
            onClick={executeWorkflow}
            disabled={!selectedNode}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded mb-2"
          >
            Execute Workflow
          </button>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded"
          >
            {showAddForm ? "Cancel" : "Add New Node"}
          </button>

          {showAddForm && (
            <form onSubmit={handleAddNode} className="mt-4 space-y-3">
              <input
                type="text"
                placeholder="Node Name"
                required
                value={newNode.name}
                onChange={(e) =>
                  setNewNode({ ...newNode, name: e.target.value })
                }
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm"
              />
              <input
                type="text"
                placeholder="Host IP/Address"
                required
                value={newNode.host}
                onChange={(e) =>
                  setNewNode({ ...newNode, host: e.target.value })
                }
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm"
              />
              <input
                type="text"
                placeholder="Port (e.g., 22)"
                required
                value={newNode.port}
                onChange={(e) =>
                  setNewNode({ ...newNode, port: e.target.value })
                }
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm"
              />
              <input
                type="text"
                placeholder="Username"
                required
                value={newNode.username}
                onChange={(e) =>
                  setNewNode({ ...newNode, username: e.target.value })
                }
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm"
              />
              <input
                type="text"
                placeholder="Private Key Path"
                required
                value={newNode.privateKeyPath}
                onChange={(e) =>
                  setNewNode({ ...newNode, privateKeyPath: e.target.value })
                }
                className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm"
              />
              <button
                type="submit"
                className="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded text-sm"
              >
                Save Node
              </button>
            </form>
          )}
        </section>

        {/* Panel 2: Nodes */}
        <section className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Connected Nodes</h2>
          <div className="space-y-2">
            {nodes.length > 0 ? (
              nodes.map((node) => (
                <div
                  key={node.name}
                  className="flex justify-between items-center p-3 bg-gray-700 rounded"
                >
                  <div>
                    <span className="font-medium">{node.name}</span>
                    <span className="text-gray-400 text-sm ml-2">
                      ({node.host}:{node.port})
                    </span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`px-2 py-1 rounded text-xs ${
                        node.status === "online" ? "bg-green-500" : "bg-red-500"
                      }`}
                    >
                      {node.status || "Pending"}
                    </span>
                    <button
                      onClick={() => handleDeleteNode(node.name)}
                      className="bg-red-600 hover:bg-red-700 text-white px-2 py-1 rounded text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-gray-400">No nodes configured.</p>
            )}
          </div>
        </section>

        {/* Panel 3: File Operations & Staging */}
        <section className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">File Operations</h2>

          <div className="mb-4">
            <h3 className="font-medium mb-2">Staging Area (server)</h3>
            <div className="bg-black p-3 rounded max-h-40 overflow-y-auto text-sm space-y-1">
              {stagingFiles.length > 0 ? (
                stagingFiles.map((f) => (
                  <div key={f.name} className="border-b border-gray-700 pb-1">
                    <div className="font-semibold">{f.name}</div>
                    <div className="text-gray-400 text-xs">
                      {f.size} bytes | {f.lastModified}
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-gray-500">No staged files.</p>
              )}
            </div>
          </div>

          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">
              Pull: Remote Path
            </label>
            <input
              type="text"
              value={pullRemotePath}
              onChange={(e) => setPullRemotePath(e.target.value)}
              placeholder="/path/on/node/file.md"
              className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Pull: Local Name (optional, server staging)
            </label>
            <input
              type="text"
              value={pullLocalName}
              onChange={(e) => setPullLocalName(e.target.value)}
              placeholder="file.md"
              className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2 mb-6">
            <button
              onClick={handlePullFile}
              disabled={!selectedNode || !pullRemotePath}
              className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded text-sm"
            >
              Pull
            </button>
          </div>

          <h3 className="text-lg font-semibold mb-2">
            Push (server staging → node)
          </h3>
          <div className="mb-3">
            <label className="block text-sm font-medium mb-1">
              Staging File Name
            </label>
            <input
              type="text"
              value={pushLocalName}
              onChange={(e) => setPushLocalName(e.target.value)}
              placeholder="file_in_staging.md"
              className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm"
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">
              Destination Path on Node
            </label>
            <input
              type="text"
              value={pushRemotePath}
              onChange={(e) => setPushRemotePath(e.target.value)}
              placeholder="/path/on/node/file.md"
              className="w-full bg-gray-700 border border-gray-600 rounded p-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={handlePushFile}
              disabled={!selectedNode || !pushLocalName || !pushRemotePath}
              className="bg-yellow-600 hover:bg-yellow-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded text-sm"
            >
              Push
            </button>
          </div>
        </section>

        {/* Panel 4: Execution Log */}
        <section className="bg-gray-800 p-6 rounded-lg">
          <h2 className="text-xl font-semibold mb-4">Execution Log</h2>
          <div className="h-96 overflow-y-auto bg-black p-4 rounded font-mono text-sm whitespace-pre-wrap">
            {wsLogs.length > 0 ? (
              wsLogs.map((log, index) => <div key={index}>{log}</div>)
            ) : (
              <p className="text-gray-500">Waiting for events...</p>
            )}
            <div ref={logEndRef} />
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;

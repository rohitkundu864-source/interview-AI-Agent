import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUp,
  BriefcaseBusiness,
  CheckCircle2,
  FileText,
  LoaderCircle,
  MessageSquare,
  Mic,
  Paperclip,
  RotateCcw,
  Sparkles,
  Timer,
  Upload,
  UserRound,
  X
} from "lucide-react";
import "./styles.css";
async function safeJson(response) {
  const text = await response.text();

  if (!text) {
    throw new Error(
      `Server returned an empty response (HTTP ${response.status}). Check the server terminal.`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Server returned invalid JSON (HTTP ${response.status}): ${text.slice(0, 300)}`
    );
  }
}
const stages = ["Introduction", "Resume deep-dive", "Technical", "Behavioral", "Closing"];

function App() {
  const [resume, setResume] = useState(null);
  const [plan, setPlan] = useState(null);
  const [messages, setMessages] = useState([]);
  const [stageIndex, setStageIndex] = useState(0);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [evaluation, setEvaluation] = useState(null);
  const [error, setError] = useState("");
  const [startedAt, setStartedAt] = useState(null);
  const [seconds, setSeconds] = useState(0);
  const fileRef = useRef(null);
  const chatRef = useRef(null);

  useEffect(() => {
    if (!startedAt || evaluation) return;
    const id = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [startedAt, evaluation]);

  useEffect(() => {
    chatRef.current?.scrollTo({ top: chatRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  const formatTime = (n) =>
    `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;

  async function uploadResume(file) {
    if (!file) return;
    setError("");
    setUploading(true);
    setEvaluation(null);

    try {
      const form = new FormData();
      form.append("resume", file);
      const response = await fetch("/api/resume", { method: "POST", body: form });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || "Resume upload failed.");

      setResume({ name: file.name, text: data.resumeText });
      setPlan(data.plan);
      setMessages([]);
      setStageIndex(0);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function startInterview() {
    if (!resume || !plan) return;
    setStartedAt(Date.now());
    setSeconds(0);
    setMessages([
      {
        role: "assistant",
        content: `Good morning, ${plan.candidateName || "Candidate"}. Thanks for joining. We'll begin with your background and then move into questions based on your resume. Please answer as you would in a real interview.`
      }
    ]);
    setLoading(true);
    try {
      const response = await fetch("/api/interview/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: resume.text,
          messages: [],
          stage: stages[0]
        })
      });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || "Could not start interview.");
      setMessages((current) => [...current, { role: "assistant", content: data.message }]);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || !resume || loading || evaluation) return;

    const next = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/interview/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resumeText: resume.text,
          messages: next,
          stage: stages[stageIndex]
        })
      });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || "Interview response failed.");

      const nextMessages = [...next, { role: "assistant", content: data.message }];
      setMessages(nextMessages);

      if (stageIndex < stages.length - 1 && nextMessages.length >= 6) {
        setStageIndex((v) => Math.min(v + 1, stages.length - 1));
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function finishInterview() {
    if (!resume || messages.length < 2) return;
    setEvaluating(true);
    setError("");

    try {
      const response = await fetch("/api/interview/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ resumeText: resume.text, messages })
      });
      const data = await safeJson(response);
      if (!response.ok) throw new Error(data.error || "Evaluation failed.");
      setEvaluation(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setEvaluating(false);
    }
  }

  function reset() {
    setResume(null);
    setPlan(null);
    setMessages([]);
    setStageIndex(0);
    setInput("");
    setEvaluation(null);
    setStartedAt(null);
    setSeconds(0);
    setError("");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">✦</span> InterviewPro</div>
        <div className="sideSection">
          <div className="sideLabel">Workspace</div>
          <button className="nav active"><MessageSquare size={17} /> Mock interview</button>
          <button className="nav"><FileText size={17} /> Resume analysis</button>
          <button className="nav"><BriefcaseBusiness size={17} /> Interview settings</button>
        </div>
        <div className="sideBottom">
          <div className="secure"><CheckCircle2 size={15} /> Gemini connected</div>
          <div className="sideHint">Your resume is used only as interview context in this session.</div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <div className="eyebrow">AI INTERVIEW SIMULATOR</div>
            <h1>Practice like it's the real thing.</h1>
          </div>
          <div className="topActions">
            <div className="timer"><Timer size={15} /> {formatTime(seconds)}</div>
            <button className="resetBtn" onClick={reset}><RotateCcw size={15} /> New session</button>
          </div>
        </header>

        <section className="progress">
          {stages.map((stage, i) => (
            <div className={`step ${i <= stageIndex ? "done" : ""}`} key={stage}>
              <span>{i + 1}</span>
              <label>{stage}</label>
            </div>
          ))}
        </section>

        <div className="workspace">
          <section className="chatPanel">
            <div className="panelHeader">
              <div className="interviewer">
                <div className="avatar"><Sparkles size={18} /></div>
                <div>
                  <strong>InterviewPro AI</strong>
                  <span>Professional interviewer · Gemini</span>
                </div>
              </div>
              <div className="live"><i /> LIVE</div>
            </div>

            <div className="chat" ref={chatRef}>
              {!resume && (
                <div className="empty">
                  <div className="emptyIcon"><FileText size={30} /></div>
                  <h2>Upload your resume to begin</h2>
                  <p>The interviewer will build questions around your projects, skills, education and experience.</p>
                  <button className="primary" onClick={() => fileRef.current?.click()}>
                    <Upload size={17} /> Upload resume
                  </button>
                  <small>PDF, TXT or Markdown · max 5 MB</small>
                </div>
              )}

              {resume && messages.length === 0 && !evaluation && (
                <div className="ready">
                  <div className="readyIcon"><CheckCircle2 size={30} /></div>
                  <h2>Resume ready</h2>
                  <p><strong>{plan?.candidateName || "Candidate"}</strong> · {plan?.targetRole || "Interview practice"}</p>
                  <div className="focusList">
                    {(plan?.focusAreas || []).map((x) => <span key={x}>{x}</span>)}
                  </div>
                  <button className="primary" onClick={startInterview}><Sparkles size={17} /> Start interview</button>
                </div>
              )}

              {messages.map((m, i) => (
                <div className={`messageRow ${m.role}`} key={i}>
                  <div className="messageAvatar">{m.role === "assistant" ? <Sparkles size={15} /> : <UserRound size={15} />}</div>
                  <div>
                    <div className="messageName">{m.role === "assistant" ? "InterviewPro" : "You"}</div>
                    <div className="bubble">{m.content}</div>
                  </div>
                </div>
              ))}

              {loading && (
                <div className="messageRow assistant">
                  <div className="messageAvatar"><Sparkles size={15} /></div>
                  <div>
                    <div className="messageName">InterviewPro</div>
                    <div className="bubble typing"><span /><span /><span /></div>
                  </div>
                </div>
              )}

              {evaluation && (
                <Evaluation evaluation={evaluation} />
              )}
            </div>

            {resume && !evaluation && (
              <div className="composerArea">
                <div className="composer">
                  <button className="iconBtn" title="Attach"><Paperclip size={18} /></button>
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Type your answer..."
                    disabled={loading}
                  />
                  <button className="iconBtn mic" title="Voice input (browser speech recognition)" onClick={() => {
                    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
                    if (!SpeechRecognition) return setError("Speech recognition is not supported in this browser.");
                    const recognition = new SpeechRecognition();
                    recognition.lang = "en-US";
                    recognition.onresult = (event) => setInput(event.results[0][0].transcript);
                    recognition.start();
                  }}><Mic size={18} /></button>
                  <button className="send" onClick={sendMessage} disabled={!input.trim() || loading}><ArrowUp size={18} /></button>
                </div>
                <div className="composerFooter">
                  <span>Be specific. Use examples, decisions and measurable results.</span>
                  <button onClick={finishInterview} disabled={evaluating || messages.length < 2}>
                    {evaluating ? <><LoaderCircle className="spin" size={14} /> Evaluating...</> : "End & evaluate"}
                  </button>
                </div>
              </div>
            )}
          </section>

          <aside className="resumePanel">
            <div className="panelHeader">
              <div>
                <div className="panelTitle">Candidate profile</div>
                <div className="panelSub">Interview context</div>
              </div>
              {resume && <CheckCircle2 size={18} className="ok" />}
            </div>

            {!resume ? (
              <div className="profileEmpty">
                <UserRound size={28} />
                <p>No resume uploaded</p>
              </div>
            ) : (
              <>
                <div className="profileCard">
                  <div className="profileAvatar">{(plan?.candidateName || "C").slice(0, 1).toUpperCase()}</div>
                  <div>
                    <h3>{plan?.candidateName || "Candidate"}</h3>
                    <p>{plan?.targetRole || "Target role not specified"}</p>
                  </div>
                </div>
                <div className="resumeFile"><FileText size={18} /><span>{resume.name}</span><CheckCircle2 size={16} /></div>

                <div className="detail">
                  <label>Experience level</label>
                  <strong>{plan?.experienceLevel || "Not specified"}</strong>
                </div>
                <div className="detail">
                  <label>Interview focus</label>
                  <div className="tags">
                    {(plan?.focusAreas || []).map((x) => <span key={x}>{x}</span>)}
                  </div>
                </div>

                <button className="uploadAgain" onClick={() => fileRef.current?.click()}><Upload size={15} /> Replace resume</button>
              </>
            )}

            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.txt,.md,text/plain,application/pdf"
              hidden
              onChange={(e) => uploadResume(e.target.files?.[0])}
            />

            {uploading && <div className="uploading"><LoaderCircle className="spin" size={16} /> Analyzing resume...</div>}
            {error && <div className="error"><X size={15} /> {error}</div>}
          </aside>
        </div>
      </main>
    </div>
  );
}

function Evaluation({ evaluation }) {
  const metrics = [
    ["Overall", evaluation.overallScore],
    ["Communication", evaluation.communication],
    ["Technical depth", evaluation.technicalDepth],
    ["Problem solving", evaluation.problemSolving],
    ["Confidence", evaluation.confidence],
    ["Resume knowledge", evaluation.resumeKnowledge]
  ];

  return (
    <div className="evaluation">
      <div className="evalHeader">
        <div>
          <div className="eyebrow">INTERVIEW REPORT</div>
          <h2>Session complete</h2>
        </div>
        <div className="score">{evaluation.overallScore}<small>/100</small></div>
      </div>
      <p className="summary">{evaluation.summary}</p>
      <div className="metrics">
        {metrics.map(([name, value]) => (
          <div className="metric" key={name}>
            <div><span>{name}</span><strong>{value}</strong></div>
            <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="evalColumns">
        <div><h4>Strengths</h4><ul>{evaluation.strengths?.map((x) => <li key={x}>{x}</li>)}</ul></div>
        <div><h4>Improve next</h4><ul>{evaluation.improvements?.map((x) => <li key={x}>{x}</li>)}</ul></div>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);

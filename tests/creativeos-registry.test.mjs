import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const readJson = (path) => JSON.parse(read(path));

const registry = readJson("../creativeos/registry/tools.json");
const engines = readJson("../creativeos/registry/engines.json");
const rules = readJson("../creativeos/registry/rules.json");
const plan = readJson("../creativeos/examples/plan-scalers-plus.json");
const skill = read("../.claude/skills/creativeos/SKILL.md");

const AI_ADS_PREFIX = "mcp__AI_Ads__";
const CONSENT_RANK = { nessuno: 0, budget: 1, esplicito: 2, chiave: 3 };
const toolsByName = new Map(registry.tools.map((tool) => [tool.name, tool]));
const satelliteServers = new Set(registry.satellites.map((satellite) => satellite.server));

function agentFiles() {
  const dir = new URL("../.claude/agents/", import.meta.url);
  return readdirSync(dir)
    .filter((file) => file.startsWith("creativeos-") && file.endsWith(".md"))
    .map((file) => {
      const text = readFileSync(new URL(file, dir), "utf8");
      const frontmatter = text.match(/^---\n([\s\S]*?)\n---/);
      assert.ok(frontmatter, `${file} senza frontmatter`);
      const field = (key) => frontmatter[1].match(new RegExp(`^${key}:\\s*(.+)$`, "m"))?.[1].trim();
      const tools = (field("tools") ?? "").split(",").map((tool) => tool.trim()).filter(Boolean);
      return {
        file,
        agent: file.replace(/^creativeos-/, "").replace(/\.md$/, ""),
        name: field("name"),
        tools,
        aiAdsTools: tools.filter((tool) => tool.startsWith(AI_ADS_PREFIX)).map((tool) => tool.slice(AI_ADS_PREFIX.length)),
      };
    });
}

const agents = agentFiles();
const agentsById = new Map(agents.map((agent) => [agent.agent, agent]));

function owns(agentId, toolName) {
  const tool = toolsByName.get(toolName);
  return Boolean(tool) && (tool.agent === agentId || tool.also.includes(agentId));
}

test("il registro elenca i 38 tool dell'MCP AI Ads senza duplicati", () => {
  assert.equal(registry.tools.length, 38);
  assert.equal(toolsByName.size, registry.tools.length);
});

test("ogni tool ha agente, costo e consenso validi", () => {
  for (const tool of registry.tools) {
    assert.ok(registry.agents.includes(tool.agent), `${tool.name}: agente ${tool.agent} sconosciuto`);
    for (const other of tool.also) {
      assert.ok(registry.agents.includes(other), `${tool.name}: agente ${other} sconosciuto`);
    }
    assert.ok(tool.cost in registry.cost_classes, `${tool.name}: costo ${tool.cost}`);
    assert.ok(tool.consent in registry.consent_levels, `${tool.name}: consenso ${tool.consent}`);
  }
});

test("i tool a crediti BrandSearch non partono senza un consenso esplicito", () => {
  for (const tool of registry.tools.filter((entry) => entry.cost === "C4")) {
    assert.ok(CONSENT_RANK[tool.consent] >= CONSENT_RANK.esplicito, `${tool.name} e' C4 con consenso ${tool.consent}`);
  }
});

test("ogni agente del registro ha un file e ogni file un agente del registro", () => {
  const fileAgents = new Set(agents.map((agent) => agent.agent));
  for (const id of registry.agents.filter((id) => id !== "orchestrator")) {
    assert.ok(fileAgents.has(id), `manca .claude/agents/creativeos-${id}.md`);
  }
  for (const agent of agents) {
    assert.ok(registry.agents.includes(agent.agent), `${agent.file} non e' nel registro`);
    assert.equal(agent.name, `creativeos-${agent.agent}`, `${agent.file}: name nel frontmatter`);
  }
});

test("gli agenti usano solo tool AI Ads che possiedono", () => {
  for (const agent of agents) {
    for (const tool of agent.aiAdsTools) {
      assert.ok(toolsByName.has(tool), `${agent.file}: ${tool} non e' nel registro`);
      assert.ok(owns(agent.agent, tool), `${agent.file}: ${tool} non e' assegnato a ${agent.agent}`);
    }
  }
});

test("ogni tool del registro e' raggiungibile dal suo agente responsabile", () => {
  for (const tool of registry.tools) {
    if (tool.agent === "orchestrator") {
      assert.ok(skill.includes(`${AI_ADS_PREFIX}${tool.name}`), `la skill creativeos non cita ${tool.name}`);
      continue;
    }
    const agent = agentsById.get(tool.agent);
    assert.ok(agent.aiAdsTools.includes(tool.name), `${agent.file} non dichiara ${tool.name}`);
  }
});

test("il router cita solo motori definiti e ha un solo default", () => {
  const aliases = new Set(engines.engines.map((engine) => engine.alias));
  const fallbackIds = new Set(engines.fallbacks.map((fallback) => fallback.id));
  assert.equal(engines.engines.filter((engine) => engine.default).length, 1);
  for (const route of engines.routes) {
    for (const ref of [route.primary, ...route.alternates]) {
      assert.ok(aliases.has(ref), `${route.id}: motore ${ref} sconosciuto`);
    }
    assert.ok(aliases.has(route.fallback) || fallbackIds.has(route.fallback), `${route.id}: fallback ${route.fallback}`);
  }
  for (const contender of engines.engine_tournament.contenders) {
    assert.ok(aliases.has(contender), `torneo: ${contender} sconosciuto`);
  }
});

test("il portafoglio di default somma a 1", () => {
  const { exploit, iterate, explore } = rules.portfolio;
  assert.equal(Math.round((exploit + iterate + explore) * 100), 100);
});

test("il piano di esempio rispetta il contratto del Planner", () => {
  assert.match(plan.plan_id, /^cp-[0-9]{8}-[a-z0-9-]+$/);
  assert.ok(plan.reference_image, "reference_image obbligatoria");
  const { exploit, iterate, explore } = plan.portfolio;
  assert.equal(Math.round((exploit + iterate + explore) * 100), 100);

  const ids = plan.steps.map((step) => step.id);
  assert.equal(new Set(ids).size, ids.length, "id dei passi duplicati");

  for (const step of plan.steps) {
    assert.match(step.id, /^S[0-9]{2}$/);
    assert.ok(registry.agents.includes(step.agent), `${step.id}: agente ${step.agent}`);
    for (const dep of step.depends_on) {
      assert.ok(ids.includes(dep), `${step.id}: dipendenza ${dep} inesistente`);
    }
    if (step.tool.includes(":")) {
      const [server] = step.tool.split(":");
      assert.ok(satelliteServers.has(server), `${step.id}: server ${server} non e' un satellite`);
      continue;
    }
    const tool = toolsByName.get(step.tool);
    assert.ok(tool, `${step.id}: tool ${step.tool} non e' nel registro`);
    assert.ok(owns(step.agent, step.tool), `${step.id}: ${step.agent} non possiede ${step.tool}`);
    assert.equal(step.cost, tool.cost, `${step.id}: costo diverso dal registro`);
    assert.ok(CONSENT_RANK[step.consent] >= CONSENT_RANK[tool.consent], `${step.id}: consenso piu' largo del registro`);
  }
});

test("il piano di esempio e' aciclico e sta nel budget", () => {
  const byId = new Map(plan.steps.map((step) => [step.id, step]));
  const state = new Map();
  const visit = (id) => {
    if (state.get(id) === "done") return;
    assert.notEqual(state.get(id), "visiting", `ciclo che passa da ${id}`);
    state.set(id, "visiting");
    byId.get(id).depends_on.forEach(visit);
    state.set(id, "done");
  };
  plan.steps.forEach((step) => visit(step.id));

  const estimated = plan.steps.reduce((sum, step) => sum + (step.est_usd ?? 0), 0);
  assert.ok(estimated <= plan.budget.max_usd, `stima ${estimated} oltre il budget ${plan.budget.max_usd}`);
});

test("ogni render di copy nuovo discende dal pre-flight D3/D4", () => {
  const byId = new Map(plan.steps.map((step) => [step.id, step]));
  const ancestors = (id, seen = new Set()) => {
    for (const dep of byId.get(id).depends_on) {
      if (!seen.has(dep)) {
        seen.add(dep);
        ancestors(dep, seen);
      }
    }
    return seen;
  };
  // fidelity_test rigenera dal master_prompt di una ad esistente: non introduce copy nuovo.
  const renders = plan.steps.filter((step) => step.cost === "C3" && step.tool !== "fidelity_test");
  assert.ok(renders.length > 0);
  for (const step of renders) {
    const hasPreflight = [...ancestors(step.id)].some((id) => byId.get(id).tool === "preflight_copy");
    assert.ok(hasPreflight, `${step.id} (${step.tool}) non passa da preflight_copy`);
  }
});

test("i motori del piano esistono e GPT Image 2.5 parte solo se nominato", () => {
  const aliases = new Map(engines.engines.map((engine) => [engine.alias, engine]));
  const ids = new Map(engines.engines.map((engine) => [engine.id, engine]));
  for (const alias of plan.engines.allowed) {
    assert.ok(aliases.has(alias), `motore ${alias} sconosciuto`);
  }
  const routeIds = new Set(engines.routes.map((route) => route.id));
  for (const route of plan.engines.routes) {
    assert.ok(routeIds.has(route), `route ${route} sconosciuta`);
  }
  for (const step of plan.steps) {
    const used = [step.inputs?.model, ...(step.inputs?.tournament ?? [])].filter(Boolean);
    for (const ref of used) {
      const engine = aliases.get(ref) ?? ids.get(ref);
      assert.ok(engine, `${step.id}: motore ${ref} sconosciuto`);
      if (engine.explicit_only) {
        assert.ok(plan.engines.allowed.includes(engine.alias), `${step.id}: ${engine.alias} non nominato nel piano`);
      }
    }
  }
});

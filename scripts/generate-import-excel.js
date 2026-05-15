const path = require("path");
const XLSX = require("xlsx");

function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(value) {
  return normalizeText(value).replace(/[^a-z0-9]+/g, " ").trim();
}

function slug(value) {
  const s = normalizeText(value);
  const dashed = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return (dashed || "sem-nome").slice(0, 30);
}

function ymd(date) {
  const dt = date instanceof Date ? date : new Date(String(date));
  if (Number.isNaN(dt.getTime())) return "0000-00-00";
  const y = String(dt.getFullYear());
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isEmptyLike(v) {
  const s = String(v ?? "").trim();
  if (!s) return true;
  const t = s.toLowerCase();
  return t === "-" || t === "null" || t === "undefined";
}

function asText(v) {
  return String(v ?? "").trim();
}

function asDate(v) {
  if (!v) return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return v;
  if (typeof v === "number" && Number.isFinite(v)) {
    const utcDays = v - 25569;
    const utcValue = utcDays * 86400 * 1000;
    const d = new Date(utcValue);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  if (!s) return null;
  const d1 = new Date(s);
  if (!Number.isNaN(d1.getTime())) return d1;
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (m) {
    const day = Number(m[1]);
    const month = Number(m[2]);
    const year = Number(m[3].length === 2 ? `20${m[3]}` : m[3]);
    const d2 = new Date(year, month - 1, day);
    return Number.isNaN(d2.getTime()) ? null : d2;
  }
  return null;
}

function asPremium(v) {
  if (v == null) return "";
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s0 = String(v).trim();
  if (!s0) return "";
  const compact = s0.replace(/\s/g, "");
  if (/^\d+(\.\d{1,2})$/.test(compact)) {
    const num = Number(compact);
    return Number.isFinite(num) ? num : "";
  }
  if (/^\d+(,\d{1,2})$/.test(compact)) {
    const num = Number(compact.replace(",", "."));
    return Number.isFinite(num) ? num : "";
  }

  const s = compact.replace(/\./g, "").replace(",", ".");
  const num = Number(s);
  if (!Number.isFinite(num)) return "";
  return num;
}

function cleanCpfCnpj(v) {
  return String(v ?? "").trim();
}

function isGeneratedCpf(v) {
  return String(v ?? "").toUpperCase().startsWith("SEMCPF-");
}

function makeCpfFallbackFromName(name) {
  return `SEMCPF-${slug(name)}`;
}

function makePolicyNoFallback(name, startDate, insurer, policyType) {
  const parts = [
    slug(name),
    ymd(startDate || new Date(0)),
    slug(insurer),
    slug(policyType),
  ].filter(Boolean);
  return `SEMNUM-${parts.join("-").slice(0, 60)}`;
}

const HEADER_FULL = [
  "Nome",
  "CPF/CNPJ",
  "Email",
  "Telefone",
  "Data de nascimento",
  "Observacoes",
  "Seguradora",
  "Tipo",
  "Numero apolice",
  "Inicio",
  "Vencimento",
  "Premio",
  "Status",
];

function makeSheet(rows) {
  return XLSX.utils.aoa_to_sheet([HEADER_FULL, ...rows]);
}

function sheetSafeName(name) {
  const trimmed = String(name || "").trim();
  const safe = trimmed.length > 31 ? trimmed.slice(0, 31) : trimmed;
  return safe || "ABA";
}

function parseSheetRecords(wb, sheetName) {
  if (sheetName === "IMPORT") {
    return { sheetName, records: [], ignored: 0 };
  }
  const sheet = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: false,
    defval: "",
  });
  const header = rows[0] || [];
  const data = rows.slice(1);

  const records = [];
  let ignored = 0;

  const headerIndex = {};
  header.forEach((h, idx) => {
    const key = normalizeHeader(h);
    if (key) headerIndex[key] = idx;
  });

  const idxStdNome =
    headerIndex["nome"] ??
    headerIndex["name"] ??
    headerIndex["cliente"] ??
    headerIndex["segurado"];
  const idxStdCpf = headerIndex["cpf cnpj"] ?? headerIndex["cpf/cnpj"] ?? headerIndex["cpfcnpj"];
  const idxStdBirth =
    headerIndex["data de nascimento"] ??
    headerIndex["data nascimento"] ??
    headerIndex["nascimento"] ??
    headerIndex["aniversario"];
  const idxStdNotes =
    headerIndex["observacoes"] ??
    headerIndex["observacao"] ??
    headerIndex["obs"] ??
    headerIndex["anotacoes"] ??
    headerIndex["notas"] ??
    headerIndex["notes"];
  const idxStdEmail = headerIndex["email"] ?? headerIndex["e mail"] ?? headerIndex["e-mail"];
  const idxStdPhone =
    headerIndex["telefone"] ??
    headerIndex["celular"] ??
    headerIndex["fone"] ??
    headerIndex["contato"] ??
    headerIndex["whatsapp"];

  const idxStdInsurer = headerIndex["seguradora"] ?? headerIndex["companhia"] ?? headerIndex["cia"];
  const idxStdPolicyType =
    headerIndex["tipo"] ??
    headerIndex["ramo"] ??
    headerIndex["tipo seguro"] ??
    headerIndex["modalidade"];
  const idxStdPolicyNo =
    headerIndex["numero apolice"] ??
    headerIndex["numero da apolice"] ??
    headerIndex["n apolice"] ??
    headerIndex["apolice"] ??
    headerIndex["policy no"] ??
    headerIndex["placa"];
  const idxStdStart =
    headerIndex["inicio"] ??
    headerIndex["vigencia"] ??
    headerIndex["vigencia inicio"] ??
    headerIndex["data inicio"] ??
    headerIndex["inicio vigencia"];
  const idxStdEnd =
    headerIndex["vencimento"] ??
    headerIndex["fim"] ??
    headerIndex["vigencia fim"] ??
    headerIndex["data vencimento"] ??
    headerIndex["fim vigencia"] ??
    headerIndex["termino"];
  const idxStdPremium =
    headerIndex["premio"] ??
    headerIndex["premio total"] ??
    headerIndex["valor premio"] ??
    headerIndex["premium"] ??
    headerIndex["valor"];
  const idxStdStatus = headerIndex["status"] ?? headerIndex["situacao"];

  const looksStandard = typeof idxStdNome === "number" && typeof idxStdCpf === "number";
  if (looksStandard) {
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (!Array.isArray(r)) {
        ignored++;
        continue;
      }

      const name = idxStdNome != null ? asText(r[idxStdNome]) : "";
      if (!name) {
        ignored++;
        continue;
      }

      const cpfCnpj = idxStdCpf != null ? cleanCpfCnpj(r[idxStdCpf]) : "";
      const birthDate = idxStdBirth != null ? asDate(r[idxStdBirth]) : null;
      const notes = idxStdNotes != null ? asText(r[idxStdNotes]) : "";
      const email = idxStdEmail != null ? asText(r[idxStdEmail]) : "";
      const phone = idxStdPhone != null ? asText(r[idxStdPhone]) : "";

      const insurer = idxStdInsurer != null ? asText(r[idxStdInsurer]) : "";
      const policyType = idxStdPolicyType != null ? asText(r[idxStdPolicyType]) : "";
      const policyNo = idxStdPolicyNo != null ? asText(r[idxStdPolicyNo]) : "";
      const startDate = idxStdStart != null ? asDate(r[idxStdStart]) : null;
      const endDate = idxStdEnd != null ? asDate(r[idxStdEnd]) : null;
      const premium = idxStdPremium != null ? asPremium(r[idxStdPremium]) : "";
      const status = idxStdStatus != null ? asText(r[idxStdStatus]) : "";

      const hasPolicyAny =
        !isEmptyLike(insurer) ||
        !isEmptyLike(policyType) ||
        !isEmptyLike(policyNo) ||
        (startDate instanceof Date && !Number.isNaN(startDate.getTime()));

      records.push({
        sheetName,
        name,
        nameKey: normalizeText(name),
        birthDate,
        cpfCnpj: isEmptyLike(cpfCnpj) ? "" : cpfCnpj,
        email: isEmptyLike(email) ? "" : email,
        phone: isEmptyLike(phone) ? "" : phone,
        notes: isEmptyLike(notes) ? "" : notes,
        insurer: isEmptyLike(insurer) ? "" : insurer,
        policyType: isEmptyLike(policyType) ? "" : policyType,
        policyNo: isEmptyLike(policyNo) ? "" : policyNo,
        startDate,
        endDate,
        premium,
        status: isEmptyLike(status) ? "" : status,
        vehicle: "",
        profile: "",
        kind: hasPolicyAny ? "policy" : "client",
      });
    }

    return { sheetName, records, ignored };
  }

  if (sheetName === "ANIVERSARIANTES") {
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (!Array.isArray(r)) {
        ignored++;
        continue;
      }

      const birthDate = asDate(r[0]);
      const name = asText(r[1]);
      const insurerHint = asText(r[6]);

      const isMonthRow =
        isEmptyLike(name) &&
        typeof r[0] === "string" &&
        String(r[0]).trim() &&
        !/\d/.test(String(r[0]));
      if (isMonthRow) {
        ignored++;
        continue;
      }

      if (!name || !birthDate) {
        ignored++;
        continue;
      }

      records.push({
        sheetName,
        name,
        nameKey: normalizeText(name),
        birthDate,
        cpfCnpj: "",
        email: "",
        phone: "",
        notes: insurerHint ? `Seguradora: ${insurerHint}` : "",
        insurer: "",
        policyType: "",
        policyNo: "",
        startDate: null,
        endDate: null,
        premium: "",
        status: "",
        vehicle: "",
        profile: "",
        kind: "client",
      });
    }

    return { sheetName, records, ignored };
  }

  if (sheetName === "CARTEIRA GERAL") {
    for (let i = 0; i < data.length; i++) {
      const r = data[i];
      if (!Array.isArray(r)) {
        ignored++;
        continue;
      }

      const startDate = asDate(r[0]);
      const name = asText(r[1]);
      if (!name) {
        ignored++;
        continue;
      }

      records.push({
        sheetName,
        name,
        nameKey: normalizeText(name),
        birthDate: null,
        cpfCnpj: "",
        email: "",
        phone: "",
        notes: "",
        insurer: "",
        policyType: "",
        policyNo: "",
        startDate,
        endDate: null,
        premium: "",
        status: "",
        vehicle: "",
        profile: "",
        kind: "client",
      });
    }

    return { sheetName, records, ignored };
  }

  const idxVig = headerIndex["vigencia"];
  const idxSeg = headerIndex["segurado"];
  const idxTipo = headerIndex["tipo"];
  const idxSeguradora = headerIndex["seguradora"];
  const idxVeiculo = headerIndex["veiculo"];
  const idxPlaca = headerIndex["placa"];
  const idxPremio = headerIndex["premio total"] ?? headerIndex["premio"];
  const idxCpf = headerIndex["cpf cnpj"] ?? headerIndex["cpf/cnpj"];
  const idxPerfil = headerIndex["perfil"];

  for (let i = 0; i < data.length; i++) {
    const r = data[i];
    if (!Array.isArray(r)) {
      ignored++;
      continue;
    }

    const startDate = idxVig != null ? asDate(r[idxVig]) : null;
    const name = idxSeg != null ? asText(r[idxSeg]) : "";
    if (!name) {
      ignored++;
      continue;
    }

    const insurer = idxSeguradora != null ? asText(r[idxSeguradora]) : "";
    const policyType = idxTipo != null ? asText(r[idxTipo]) : "";
    const vehicle = idxVeiculo != null ? asText(r[idxVeiculo]) : "";
    const plate = idxPlaca != null ? asText(r[idxPlaca]) : "";
    const premium = idxPremio != null ? asPremium(r[idxPremio]) : "";
    const cpfCnpj = idxCpf != null ? cleanCpfCnpj(r[idxCpf]) : "";
    const profile = idxPerfil != null ? asText(r[idxPerfil]) : "";

    let policyNo = !isEmptyLike(plate) ? plate : "";
    if (!policyNo && insurer && policyType && startDate) {
      policyNo = makePolicyNoFallback(name, startDate, insurer, policyType);
    }

    records.push({
      sheetName,
      name,
      nameKey: normalizeText(name),
      birthDate: null,
      cpfCnpj: isEmptyLike(cpfCnpj) ? "" : cpfCnpj,
      email: "",
      phone: "",
      notes: "",
      insurer: isEmptyLike(insurer) ? "" : insurer,
      policyType: isEmptyLike(policyType) ? "" : policyType,
      policyNo: isEmptyLike(policyNo) ? "" : policyNo,
      startDate,
      endDate: null,
      premium,
      status: "",
      vehicle: isEmptyLike(vehicle) ? "" : vehicle,
      profile: isEmptyLike(profile) ? "" : profile,
      kind: "policy",
    });
  }

  return { sheetName, records, ignored };
}

function generate({ inputPath, outputPath }) {
  const wb = XLSX.readFile(inputPath, { cellDates: true });
  const sheetBuilds = wb.SheetNames.map((n) => parseSheetRecords(wb, n));
  const all = sheetBuilds.flatMap((s) => s.records);

  const nameToRealCpfs = new Map();
  for (const r of all) {
    const cpf = cleanCpfCnpj(r.cpfCnpj);
    if (!cpf || isEmptyLike(cpf) || isGeneratedCpf(cpf)) continue;
    const set = nameToRealCpfs.get(r.nameKey) ?? new Set();
    set.add(cpf);
    nameToRealCpfs.set(r.nameKey, set);
  }

  for (const r of all) {
    if (r.cpfCnpj && !isEmptyLike(r.cpfCnpj) && !isGeneratedCpf(r.cpfCnpj)) continue;
    const set = nameToRealCpfs.get(r.nameKey);
    if (set && set.size === 1) r.cpfCnpj = Array.from(set)[0];
  }

  function clientKeyFor(r) {
    const cpf = cleanCpfCnpj(r.cpfCnpj);
    if (cpf && !isEmptyLike(cpf)) return `CPF:${cpf}`;
    return `NAME:${r.nameKey}`;
  }

  const clients = new Map();
  for (const r of all) {
    const key = clientKeyFor(r);
    const existing =
      clients.get(key) ??
      {
        key,
        name: r.name,
        nameKey: r.nameKey,
        cpfCnpj: "",
        birthDate: null,
        email: "",
        phone: "",
        notesParts: new Set(),
      };

    if (String(r.name || "").trim().length > String(existing.name || "").trim().length) {
      existing.name = r.name;
    }

    const cpf = cleanCpfCnpj(r.cpfCnpj);
    if (cpf && !isEmptyLike(cpf) && (!existing.cpfCnpj || isGeneratedCpf(existing.cpfCnpj))) {
      existing.cpfCnpj = cpf;
    }

    if (r.birthDate instanceof Date && !Number.isNaN(r.birthDate.getTime())) {
      existing.birthDate = existing.birthDate ?? r.birthDate;
    }

    const note = asText(r.notes);
    if (note) {
      for (const part of note.split("|")) {
        const p = String(part).trim();
        if (!p) continue;
        if (p.toLowerCase().startsWith("origem:")) continue;
        existing.notesParts.add(p);
      }
    }

    clients.set(key, existing);
  }

  for (const c of clients.values()) {
    if (!c.cpfCnpj || isEmptyLike(c.cpfCnpj)) c.cpfCnpj = makeCpfFallbackFromName(c.name);
  }

  const policyRows = [];
  const clientOnlyRows = [];

  for (const r of all) {
    const c = clients.get(clientKeyFor(r));
    const baseNotes = [];
    baseNotes.push(`Origem: ${r.sheetName}`);
    if (c.notesParts.size) for (const p of c.notesParts) baseNotes.push(p);
    if (r.profile) baseNotes.push(`Perfil: ${r.profile}`);
    if (r.vehicle) baseNotes.push(`Veiculo: ${r.vehicle}`);
    const notes = Array.from(new Set(baseNotes.filter(Boolean))).join(" | ");

    const common = [c.name, c.cpfCnpj, "", "", c.birthDate ?? "", notes];

    if (r.kind === "policy") {
      policyRows.push([
        ...common,
        r.insurer || "",
        r.policyType || "",
        r.policyNo || "",
        r.startDate ?? "",
        "",
        r.premium === "" ? "" : r.premium,
        r.status || "",
      ]);
    } else {
      clientOnlyRows.push([...common, "", "", "", "", "", "", ""]);
    }
  }

  const clientsWithPolicy = new Set(policyRows.map((r) => r[1]));
  const filteredClientOnly = clientOnlyRows.filter((r) => !clientsWithPolicy.has(r[1]));

  const seenClientOnly = new Set();
  const dedupedClientOnly = [];
  for (const r of filteredClientOnly) {
    const k = r[1];
    if (seenClientOnly.has(k)) continue;
    seenClientOnly.add(k);
    dedupedClientOnly.push(r);
  }

  const importRows = [...policyRows, ...dedupedClientOnly];

  const perSheetRows = new Map();
  for (const r of all) {
    const c = clients.get(clientKeyFor(r));
    const notesParts = [`Origem: ${r.sheetName}`];
    if (c.notesParts.size) for (const p of c.notesParts) notesParts.push(p);
    if (r.profile) notesParts.push(`Perfil: ${r.profile}`);
    if (r.vehicle) notesParts.push(`Veiculo: ${r.vehicle}`);
    const notes = Array.from(new Set(notesParts.filter(Boolean))).join(" | ");
    const common = [c.name, c.cpfCnpj, "", "", c.birthDate ?? "", notes];
    const row =
      r.kind === "policy"
        ? [
            ...common,
            r.insurer || "",
            r.policyType || "",
            r.policyNo || "",
            r.startDate ?? "",
            "",
            r.premium === "" ? "" : r.premium,
            r.status || "",
          ]
        : [...common, "", "", "", "", "", "", ""];

    const arr = perSheetRows.get(r.sheetName) ?? [];
    arr.push(row);
    perSheetRows.set(r.sheetName, arr);
  }

  const outWb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(outWb, makeSheet(importRows), "IMPORT");
  for (const name of wb.SheetNames) {
    if (name === "IMPORT") continue;
    const rows = perSheetRows.get(name) ?? [];
    XLSX.utils.book_append_sheet(outWb, makeSheet(rows), sheetSafeName(name));
  }

  XLSX.writeFile(outWb, outputPath, { bookType: "xlsx", cellDates: true });

  return {
    inputPath,
    outputPath,
    sheetCount: outWb.SheetNames.length,
    uniqueClients: clients.size,
    policyRows: policyRows.length,
    clientOnlyRows: dedupedClientOnly.length,
    importRows: importRows.length,
  };
}

const inputPath = path.resolve(process.argv[2] || "Carteira Clientes_ATUALIZADA.xlsx");
const outputPath = path.resolve(process.argv[3] || "Carteira Clientes_IMPORT_COMPLETO.xlsx");

const stats = generate({ inputPath, outputPath });
process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);

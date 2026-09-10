/**
 * Generates a stand-in `perseus-sample.db` shaped like the hackathon's
 * `perseus_equipment_database.db`: same table names, same column names, same
 * TEXT dates and NUMERIC money described in the challenge README.
 *
 * The numbers are invented. Customers are generated from behavioural archetypes
 * (dormant, parts-only, high-churn, ...) so the opportunity rules have something
 * real to find. Dropping the genuine database at the repo root supersedes this.
 */
import Database from "better-sqlite3";
import { mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const OUT = resolve(process.cwd(), "data/perseus-sample.db");
const NOW = new Date();
const HISTORY_MONTHS = 36;

// ---------------------------------------------------------------- rng + dates

function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260910);

const rand = (lo: number, hi: number) => lo + rnd() * (hi - lo);
const randInt = (lo: number, hi: number) => Math.floor(rand(lo, hi + 1));
const pick = <T,>(xs: readonly T[]): T => xs[randInt(0, xs.length - 1)];
const chance = (p: number) => rnd() < p;
const money = (n: number) => Math.round(n * 100) / 100;

/** README: dates are stored as TEXT in timestamp-like formats. */
function ts(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
function monthsAgo(n: number, dayOfMonth?: number): Date {
  const d = new Date(NOW);
  d.setMonth(d.getMonth() - n);
  d.setDate(dayOfMonth ?? randInt(1, 28));
  d.setHours(randInt(7, 17), randInt(0, 59), randInt(0, 59), 0);
  return d;
}
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);

// ------------------------------------------------------------------ reference

const CLASSES = [
  { code: "CONT", label: "Contractor", peak: [4, 5, 6, 7, 8, 9] },
  { code: "LAND", label: "Landscaper", peak: [3, 4, 5, 6, 7, 8] },
  { code: "MUNI", label: "Municipality", peak: [1, 2, 3, 10, 11, 12] },
  { code: "FARM", label: "Farmer", peak: [4, 5, 9, 10] },
  { code: "RENT", label: "Rental Fleet", peak: [5, 6, 7, 8] },
] as const;

const CATEGORIES = [
  "Compact Excavator",
  "Skid Steer",
  "Compact Track Loader",
  "Backhoe Loader",
  "Utility Tractor",
  "Zero-Turn Mower",
  "Telehandler",
  "Compact Wheel Loader",
];
const MAKES = ["Kubota", "Bobcat", "John Deere", "Case", "New Holland", "Takeuchi", "Yanmar", "JCB"];
const MODELS = ["SVL75", "E35", "323D", "TL8", "MX5400", "580SN", "L218", "270B", "S66", "U55"];

const PART_MFRS = [
  { code: "KUB", name: "Kubota Parts" },
  { code: "BOB", name: "Bobcat OEM" },
  { code: "DON", name: "Donaldson Filtration" },
  { code: "GTS", name: "Gates Hydraulics" },
  { code: "SKF", name: "SKF Bearings" },
  { code: "AFT", name: "Aftermarket Supply Co" },
];
const PART_GROUPS = ["Filters", "Hydraulics", "Undercarriage", "Engine", "Electrical", "Attachments", "Fluids"];
const PART_LINES = ["Maintenance", "Wear Parts", "Powertrain", "Cab & Controls"];

/**
 * Service codes. The engine treats planned/preventive work as a "new service"
 * purchase and everything else as reactive repair. On the real database these
 * are discovered by pattern-matching the codes actually present.
 */
const PROACTIVE_CODES = [
  { code: "PM-PLAN", desc: "Scheduled maintenance plan" },
  { code: "PM-250", desc: "250 hour service interval" },
  { code: "INSPECT", desc: "Annual inspection" },
  { code: "TRAINING", desc: "On-site operator training" },
  { code: "WARR-EXT", desc: "Extended coverage inspection" },
];
const REACTIVE_CODES = [
  { code: "REPAIR", desc: "General repair" },
  { code: "DIAG", desc: "Diagnostics" },
  { code: "HYD-RPR", desc: "Hydraulic repair" },
  { code: "ELEC-RPR", desc: "Electrical repair" },
  { code: "TRACK", desc: "Undercarriage repair" },
  { code: "ENG-RPR", desc: "Engine repair" },
  { code: "FIELD", desc: "Field service call" },
];

const WO_STATUSES = [
  { id: 1, desc: "Open", isOpen: 1 },
  { id: 2, desc: "In Shop", isOpen: 1 },
  { id: 3, desc: "Awaiting Parts", isOpen: 1 },
  { id: 4, desc: "Ready for Pickup", isOpen: 1 },
  { id: 5, desc: "Closed", isOpen: 0 },
  { id: 6, desc: "Invoiced", isOpen: 0 },
];

const PAYMENT_METHODS = ["Cash", "Check", "Credit Card", "House Account", "ACH Transfer", "Floor Plan"];
const LOCATIONS = [
  { id: 1, code: "CDR", name: "Cedar Rapids" },
  { id: 2, code: "DVN", name: "Davenport" },
  { id: 3, code: "WLO", name: "Waterloo" },
];

const NAME_HEADS = [
  "Ridgeline", "Cedar Valley", "Northgate", "Prairie", "Ironwood", "Blackhawk", "Summit", "Copperfield",
  "Riverbend", "Stonebridge", "Havenwood", "Fairmount", "Lakeshore", "Grandview", "Westbrook", "Millbrook",
  "Oakhurst", "Silverpine", "Clearwater", "Hollowbrook", "Brightwater", "Thornfield", "Eastvale", "Redstone",
  "Whitetail", "Sandhill", "Elmgrove", "Foxglove", "Harvest Moon", "Bluestem", "Cottonwood", "Deerfield",
  "Maplewood", "Windrow", "Quarry Hill", "Trailhead",
];
const NAME_TAILS_BY_CLASS: Record<string, string[]> = {
  CONT: ["Construction", "Excavating", "Contracting", "Site Works", "Builders", "Earthworks", "Concrete"],
  LAND: ["Landscaping", "Lawn Care", "Grounds Services", "Tree Service", "Outdoor Services"],
  MUNI: ["Township", "County Public Works", "City Services", "Parks District", "Water District"],
  FARM: ["Farms", "Family Farm", "Grain Co", "Livestock Co", "Acres"],
  RENT: ["Rentals", "Equipment Rental", "Tool & Equipment"],
};
const FIRST_NAMES = ["Dale", "Marcy", "Terrance", "Lynn", "Curtis", "Roberta", "Hank", "Joann", "Vernon", "Paula", "Duane", "Shirley", "Randy", "Gail", "Wendell", "Arlene", "Kirby", "Dorothy", "Elmer", "Janine"];
const LAST_NAMES = ["Brennan", "Kowalski", "Hoffstetter", "Vandenberg", "Mulcahy", "Osterman", "Ruggiero", "Thorsen", "Delacroix", "Winterbourne", "Halvorsen", "Prentice", "Cavanaugh", "Bramblett", "Quintero", "Ashford"];
const TITLES = ["Owner", "Operations Manager", "Shop Foreman", "Fleet Manager", "Purchasing", "Superintendent", "Office Manager"];
const TECH_NAMES = ["Wade Lindqvist", "Otis Barrera", "Merle Pankratz", "Junior Vasquez", "Dell Chatterton", "Roscoe Ibarra", "Buck Nakamura", "Sonny Delgado"];
const SALES_NAMES = ["Nadine Prescott", "Gus Halloway", "Marla Fitzgibbon", "Ray Okonkwo", "Trudy Vasseur", "Chip Marchetti"];

/** Behavioural archetypes; `weight` is how many customers get each. */
type Archetype =
  | "healthy"
  | "owns_never_serviced"
  | "owns_absent"
  | "parts_only"
  | "low_service"
  | "high_churn"
  | "renter"
  | "lapsed"
  | "warranty_lapsing"
  | "quiet";

const ARCHETYPE_MIX: { kind: Archetype; count: number }[] = [
  { kind: "healthy", count: 34 },
  { kind: "owns_never_serviced", count: 10 },
  // Bought a machine and was never seen again, for parts or for labor. Rarer
  // than the self-servicing account, and the only archetype that isolates
  // "owns machines, buys nothing" from "owns machines, buys parts".
  { kind: "owns_absent", count: 5 },
  { kind: "parts_only", count: 14 },
  { kind: "low_service", count: 19 },
  { kind: "high_churn", count: 13 },
  { kind: "renter", count: 10 },
  { kind: "lapsed", count: 18 },
  { kind: "warranty_lapsing", count: 12 },
  { kind: "quiet", count: 5 },
];

// ---------------------------------------------------------------------- schema

const DDL = `
PRAGMA journal_mode = MEMORY;

CREATE TABLE Location (
  LocationId INTEGER PRIMARY KEY, LocationCode TEXT, Description TEXT, IsActive NUMERIC
);
CREATE TABLE CustomerClassType (
  CustomerClassTypeId INTEGER PRIMARY KEY, Description TEXT, IsActive NUMERIC
);
CREATE TABLE CustomerClass (
  CustomerClassId INTEGER PRIMARY KEY, CustomerClassTypeId INTEGER, ClassCode TEXT,
  Description TEXT, IsActive NUMERIC
);
CREATE TABLE Customer (
  CustomerId INTEGER PRIMARY KEY, CustomerNo TEXT, CustomerName TEXT, CustomerClassId INTEGER,
  LocationId INTEGER, CreditLimit NUMERIC, CreditHold NUMERIC, TermsCode TEXT, TaxExempt NUMERIC,
  IsActive NUMERIC, EntDate TEXT, ModDate TEXT, EntBy TEXT, ModBy TEXT
);
CREATE TABLE Contact (
  ContactId INTEGER PRIMARY KEY, CustomerId INTEGER, FirstName TEXT, LastName TEXT, Title TEXT,
  IsPrimary NUMERIC, IsActive NUMERIC, EntDate TEXT, ModDate TEXT
);
CREATE TABLE CustomerEmail (
  CustomerEmailId INTEGER PRIMARY KEY, ContactId INTEGER, EmailAddress TEXT, IsPrimary NUMERIC, IsActive NUMERIC
);
CREATE TABLE CustomerPhone (
  CustomerPhoneId INTEGER PRIMARY KEY, ContactId INTEGER, PhoneNo TEXT, PhoneType TEXT,
  IsPrimary NUMERIC, IsActive NUMERIC
);
CREATE TABLE CustomerAddress (
  CustomerAddressId INTEGER PRIMARY KEY, CustomerId INTEGER, AddressType TEXT, Address1 TEXT,
  City TEXT, State TEXT, PostalCode TEXT, IsActive NUMERIC
);
CREATE TABLE AppUser (
  AppUserId INTEGER PRIMARY KEY, UserName TEXT, FullName TEXT, IsTechnician NUMERIC,
  IsSalesPerson NUMERIC, LocationId INTEGER, IsActive NUMERIC
);
CREATE TABLE SettingsWorkOrderStatus (
  WorkOrderStatusId INTEGER PRIMARY KEY, Description TEXT, IsOpen NUMERIC, IsActive NUMERIC
);
CREATE TABLE UnitCategory (
  UnitCategoryId INTEGER PRIMARY KEY, CategoryCode TEXT, Description TEXT, IsActive NUMERIC
);
CREATE TABLE UnitCondition (
  UnitConditionId INTEGER PRIMARY KEY, Description TEXT, IsActive NUMERIC
);
CREATE TABLE UnitMake (
  UnitMakeId INTEGER PRIMARY KEY, MakeCode TEXT, Description TEXT, IsActive NUMERIC
);
CREATE TABLE UnitBase (
  UnitId INTEGER PRIMARY KEY, StockNo TEXT, UnitCategoryId INTEGER, UnitConditionId INTEGER,
  UnitMakeId INTEGER, Make TEXT, Model TEXT, Year NUMERIC, StockStatus TEXT, BaseRetail NUMERIC,
  BaseCost NUMERIC, DateReceived TEXT, LocationId INTEGER, MeterHours NUMERIC, IsActive NUMERIC,
  EntDate TEXT, ModDate TEXT
);
CREATE TABLE UnitSerial (
  UnitSerialId INTEGER PRIMARY KEY, UnitId INTEGER, SerialNo TEXT, WarrantyStartDate TEXT,
  WarrantyEndDate TEXT, WarrantyMonths NUMERIC, IsActive NUMERIC
);
CREATE TABLE UnitCustomer (
  UnitCustomerId INTEGER PRIMARY KEY, UnitId INTEGER, CustomerId INTEGER, CustomerName TEXT,
  InvoiceAmount NUMERIC, TradeAmount NUMERIC, ListAmount NUMERIC, ConfiguredCost NUMERIC,
  Source TEXT, EventDate TEXT, IsActive NUMERIC
);
CREATE TABLE PartManufacturer (
  MfgId INTEGER PRIMARY KEY, MfgCode TEXT, Description TEXT, IsActive NUMERIC
);
CREATE TABLE PartGroup (
  PartGroupId INTEGER PRIMARY KEY, GroupCode TEXT, Description TEXT, IsActive NUMERIC
);
CREATE TABLE PartProductLine (
  PartProductLineId INTEGER PRIMARY KEY, ProductLineCode TEXT, Description TEXT, IsActive NUMERIC
);
CREATE TABLE PartMaster (
  PartId INTEGER PRIMARY KEY, MfgId INTEGER, PartGroupId INTEGER, PartProductLineId INTEGER,
  PartNo TEXT, Description TEXT, PartStatus TEXT, PartType TEXT, ListPrice NUMERIC,
  AvgCost NUMERIC, IsActive NUMERIC, EntDate TEXT, ModDate TEXT
);
CREATE TABLE PartLocation (
  PartLocationId INTEGER PRIMARY KEY, PartId INTEGER, LocationId INTEGER, Bin TEXT,
  MinStock NUMERIC, MaxStock NUMERIC, CountSchedule TEXT, IsStocked NUMERIC, IsActive NUMERIC
);
CREATE TABLE InvoiceHeader (
  InvoiceDocId INTEGER PRIMARY KEY, InvoiceNo TEXT, Status TEXT, InvoiceType TEXT,
  ActivityDate TEXT, CustomerId INTEGER, CustomerName TEXT, CustomerNo TEXT, SalesPersonName TEXT,
  TotalInvoice NUMERIC, LocationId INTEGER, WorkOrderStatusId INTEGER, TechnicianId INTEGER,
  TechnicianName TEXT, UnitId INTEGER, UnitStockNo TEXT, EstimatedLabor NUMERIC,
  EstimatedParts NUMERIC, EstimatedTotal NUMERIC, PickupDate TEXT, DeliveryDate TEXT,
  MeterReading NUMERIC, EntDate TEXT, ModDate TEXT, EntBy TEXT, ModBy TEXT
);
CREATE TABLE InvoiceDetail (
  ItemId INTEGER PRIMARY KEY, InvoiceDocId INTEGER, LineNo NUMERIC, ItemType TEXT,
  Description TEXT, Qty NUMERIC, UnitPrice NUMERIC, Discount NUMERIC, NetExt NUMERIC, IsActive NUMERIC
);
CREATE TABLE InvoiceMiscellaneousCharge (
  InvoiceMiscellaneousChargeId INTEGER PRIMARY KEY, InvoiceDocId INTEGER, Description TEXT, Amount NUMERIC
);
CREATE TABLE InvoiceSegment (
  SegmentId INTEGER PRIMARY KEY, InvoiceDocId INTEGER, SegmentNo NUMERIC, ServiceCode TEXT,
  SegmentStatus TEXT, Complaint TEXT, LaborAmount NUMERIC, LaborHours NUMERIC, ShopSupplies NUMERIC,
  UnitId INTEGER, UnitStockNo TEXT, TechnicianId INTEGER, IsActive NUMERIC
);
CREATE TABLE SalesTax (
  SalesTaxId INTEGER PRIMARY KEY, InvoiceDocId INTEGER, TaxableAmount NUMERIC,
  NonTaxableAmount NUMERIC, TaxAmount NUMERIC, Jurisdiction TEXT
);
CREATE TABLE SalePart (
  SalePartId INTEGER PRIMARY KEY, ItemId INTEGER, PartId INTEGER, PartNo TEXT, Description TEXT,
  Qty NUMERIC, UnitPrice NUMERIC, NetExt NUMERIC, AvgCost NUMERIC, MfgCode TEXT
);
CREATE TABLE SaleUnit (
  SaleUnitId INTEGER PRIMARY KEY, ItemId INTEGER, UnitId INTEGER, StockNo TEXT,
  SalePrice NUMERIC, ConfiguredCost NUMERIC, TradeAllowance NUMERIC
);
CREATE TABLE SaleUnitTradeIn (
  SaleUnitTradeInId INTEGER PRIMARY KEY, SaleUnitId INTEGER, Make TEXT, Model TEXT,
  SerialNo TEXT, TradeAmount NUMERIC, ActualCashValue NUMERIC
);
CREATE TABLE WorkInProgress (
  WipId INTEGER PRIMARY KEY, InvoiceDocId INTEGER, SegmentId INTEGER, TechnicianId INTEGER,
  TechnicianName TEXT, ElapsedHours NUMERIC, Comments TEXT, EntDate TEXT, IsTransferred NUMERIC
);
CREATE TABLE WorkOrderSchedule (
  WorkOrderScheduleId INTEGER PRIMARY KEY, InvoiceDocId INTEGER, RequiredDate TEXT,
  ScheduledDate TEXT, ActualDate TEXT, PromisedDate TEXT
);
CREATE TABLE Payment (
  PaymentId INTEGER PRIMARY KEY, InvoiceDocId INTEGER, PaymentMethodId INTEGER, Amount NUMERIC,
  AuthorizationCode TEXT, ReferenceNo TEXT, EntDate TEXT, IsActive NUMERIC
);
CREATE TABLE PaymentMethod (
  PaymentMethodId INTEGER PRIMARY KEY, Description TEXT, IsActive NUMERIC
);
CREATE TABLE PaymentReceivablesDetail (
  PaymentReceivablesDetailId INTEGER PRIMARY KEY, PaymentId INTEGER, InvoiceDocId INTEGER,
  BillToCustomerId INTEGER, BillToCustomerName TEXT, AmountApplied NUMERIC, EntDate TEXT
);

CREATE INDEX ix_ih_customer ON InvoiceHeader(CustomerId);
CREATE INDEX ix_ih_activity ON InvoiceHeader(ActivityDate);
CREATE INDEX ix_id_doc ON InvoiceDetail(InvoiceDocId);
CREATE INDEX ix_seg_doc ON InvoiceSegment(InvoiceDocId);
CREATE INDEX ix_sp_item ON SalePart(ItemId);
CREATE INDEX ix_wip_doc ON WorkInProgress(InvoiceDocId);
CREATE INDEX ix_uc_customer ON UnitCustomer(CustomerId);
`;

// ------------------------------------------------------------------ generation

rmSync(OUT, { force: true });
mkdirSync(dirname(OUT), { recursive: true });
const db = new Database(OUT);
db.exec(DDL);

const ins = (sql: string) => db.prepare(sql);
const iLocation = ins(`INSERT INTO Location VALUES (?,?,?,1)`);
const iClassType = ins(`INSERT INTO CustomerClassType VALUES (?,?,1)`);
const iClass = ins(`INSERT INTO CustomerClass VALUES (?,?,?,?,1)`);
const iCustomer = ins(`INSERT INTO Customer VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const iContact = ins(`INSERT INTO Contact VALUES (?,?,?,?,?,?,?,?,?)`);
const iEmail = ins(`INSERT INTO CustomerEmail VALUES (?,?,?,?,1)`);
const iPhone = ins(`INSERT INTO CustomerPhone VALUES (?,?,?,?,?,1)`);
const iAddress = ins(`INSERT INTO CustomerAddress VALUES (?,?,?,?,?,?,?,1)`);
const iUser = ins(`INSERT INTO AppUser VALUES (?,?,?,?,?,?,1)`);
const iWoStatus = ins(`INSERT INTO SettingsWorkOrderStatus VALUES (?,?,?,1)`);
const iCategory = ins(`INSERT INTO UnitCategory VALUES (?,?,?,1)`);
const iCondition = ins(`INSERT INTO UnitCondition VALUES (?,?,1)`);
const iMake = ins(`INSERT INTO UnitMake VALUES (?,?,?,1)`);
const iUnit = ins(`INSERT INTO UnitBase VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`);
const iSerial = ins(`INSERT INTO UnitSerial VALUES (?,?,?,?,?,?,1)`);
const iUnitCust = ins(`INSERT INTO UnitCustomer VALUES (?,?,?,?,?,?,?,?,?,?,1)`);
const iMfr = ins(`INSERT INTO PartManufacturer VALUES (?,?,?,1)`);
const iPartGroup = ins(`INSERT INTO PartGroup VALUES (?,?,?,1)`);
const iPartLine = ins(`INSERT INTO PartProductLine VALUES (?,?,?,1)`);
const iPart = ins(`INSERT INTO PartMaster VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?)`);
const iPartLoc = ins(`INSERT INTO PartLocation VALUES (?,?,?,?,?,?,?,?,1)`);
const iHeader = ins(`INSERT INTO InvoiceHeader VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const iDetail = ins(`INSERT INTO InvoiceDetail VALUES (?,?,?,?,?,?,?,?,?,1)`);
const iMisc = ins(`INSERT INTO InvoiceMiscellaneousCharge VALUES (?,?,?,?)`);
const iSegment = ins(`INSERT INTO InvoiceSegment VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`);
const iTax = ins(`INSERT INTO SalesTax VALUES (?,?,?,?,?,?)`);
const iSalePart = ins(`INSERT INTO SalePart VALUES (?,?,?,?,?,?,?,?,?,?)`);
const iSaleUnit = ins(`INSERT INTO SaleUnit VALUES (?,?,?,?,?,?,?)`);
const iTradeIn = ins(`INSERT INTO SaleUnitTradeIn VALUES (?,?,?,?,?,?,?)`);
const iWip = ins(`INSERT INTO WorkInProgress VALUES (?,?,?,?,?,?,?,?,?)`);
const iSchedule = ins(`INSERT INTO WorkOrderSchedule VALUES (?,?,?,?,?,?)`);
const iPayment = ins(`INSERT INTO Payment VALUES (?,?,?,?,?,?,?,1)`);
const iPayMethod = ins(`INSERT INTO PaymentMethod VALUES (?,?,1)`);
const iReceivable = ins(`INSERT INTO PaymentReceivablesDetail VALUES (?,?,?,?,?,?,?)`);

type Part = { id: number; no: string; desc: string; list: number; cost: number; mfg: string };
type Unit = { id: number; stockNo: string; category: string; make: string; model: string; year: number; retail: number; cost: number };
type Customer = {
  id: number;
  no: string;
  name: string;
  classCode: string;
  classLabel: string;
  classId: number;
  locationId: number;
  archetype: Archetype;
  salesPerson: string;
  units: Unit[];
  peak: readonly number[];
};

const seq = { doc: 0, item: 0, seg: 0, wip: 0, sched: 0, pay: 0, recv: 0, salePart: 0, saleUnit: 0, trade: 0, tax: 0, misc: 0, unitCust: 0, serial: 0, contact: 0, email: 0, phone: 0, addr: 0 };

db.exec("BEGIN");

LOCATIONS.forEach((l) => iLocation.run(l.id, l.code, l.name));
iClassType.run(1, "Trade Segment");
CLASSES.forEach((c, i) => iClass.run(i + 1, 1, c.code, c.label));
PAYMENT_METHODS.forEach((m, i) => iPayMethod.run(i + 1, m));
WO_STATUSES.forEach((s) => iWoStatus.run(s.id, s.desc, s.isOpen));
CATEGORIES.forEach((c, i) => iCategory.run(i + 1, c.slice(0, 4).toUpperCase(), c));
iCondition.run(1, "New");
iCondition.run(2, "Used");
MAKES.forEach((m, i) => iMake.run(i + 1, m.slice(0, 3).toUpperCase(), m));

const technicians = TECH_NAMES.map((name, i) => {
  const id = i + 1;
  iUser.run(id, name.toLowerCase().replace(/[^a-z]/g, ".").slice(0, 14), name, 1, 0, pick(LOCATIONS).id);
  return { id, name };
});
SALES_NAMES.forEach((name, i) => {
  iUser.run(100 + i, name.toLowerCase().replace(/[^a-z]/g, ".").slice(0, 14), name, 0, 1, pick(LOCATIONS).id);
});

// parts catalog
PART_MFRS.forEach((m, i) => iMfr.run(i + 1, m.code, m.name));
PART_GROUPS.forEach((g, i) => iPartGroup.run(i + 1, g.slice(0, 4).toUpperCase(), g));
PART_LINES.forEach((l, i) => iPartLine.run(i + 1, l.slice(0, 4).toUpperCase(), l));

const PART_NOUNS = ["Oil Filter", "Hydraulic Filter", "Air Filter", "Fuel Filter", "Track Assembly", "Idler Wheel", "Bucket Tooth", "Cutting Edge", "Hydraulic Hose", "Coupler", "Seal Kit", "Water Pump", "Alternator", "Starter", "Glow Plug", "Wiring Harness", "Mower Blade", "Drive Belt", "Radiator", "Thermostat", "Hydraulic Fluid", "Engine Oil", "Grease Cartridge", "Sprocket", "Roller", "Pin & Bushing Kit", "Control Valve", "Joystick", "Seat Cushion", "Mirror Kit"];
const parts: Part[] = [];
for (let i = 1; i <= 240; i++) {
  const mfg = PART_MFRS[randInt(0, PART_MFRS.length - 1)];
  const noun = pick(PART_NOUNS);
  const cost = money(rand(4, 900) * (chance(0.12) ? 3 : 1));
  const list = money(cost * rand(1.25, 2.1));
  const partNo = `${mfg.code}-${randInt(1000, 9999)}-${randInt(10, 99)}`;
  const desc = `${noun} ${chance(0.5) ? "OEM" : "Std"}`;
  iPart.run(i, PART_MFRS.indexOf(mfg) + 1, randInt(1, PART_GROUPS.length), randInt(1, PART_LINES.length), partNo, desc, chance(0.9) ? "active" : "superseded", chance(0.85) ? "stock" : "special", list, cost, ts(monthsAgo(randInt(12, 60))), ts(monthsAgo(randInt(0, 11))));
  parts.push({ id: i, no: partNo, desc, list, cost, mfg: mfg.code });
  // Only some parts get a real stocking policy: the brief asks about parts
  // without a useful min/max rule.
  for (const loc of LOCATIONS) {
    if (chance(0.55)) {
      const stocked = chance(0.7);
      iPartLoc.run(++seq.addr + 100000, i, loc.id, `${String.fromCharCode(65 + randInt(0, 12))}-${randInt(1, 40)}`, stocked ? randInt(1, 6) : 0, stocked ? randInt(8, 40) : 0, stocked ? pick(["monthly", "quarterly", "annual"]) : null, stocked ? 1 : 0);
    }
  }
}

// units: a pool held in stock plus units sold to customers
let unitId = 0;
function makeUnit(status: string, receivedMonthsAgo: number): Unit {
  const id = ++unitId;
  const category = pick(CATEGORIES);
  const make = pick(MAKES);
  const model = pick(MODELS);
  const isNew = chance(0.55);
  const cost = money(rand(18000, 145000));
  const retail = money(cost * rand(1.12, 1.34));
  const year = NOW.getFullYear() - (isNew ? randInt(0, 1) : randInt(2, 9));
  const stockNo = `${make.slice(0, 2).toUpperCase()}${randInt(10000, 99999)}`;
  const received = monthsAgo(receivedMonthsAgo);
  iUnit.run(id, stockNo, CATEGORIES.indexOf(category) + 1, isNew ? 1 : 2, MAKES.indexOf(make) + 1, make, model, year, status, retail, cost, ts(received), pick(LOCATIONS).id, randInt(40, 6200), ts(received), ts(monthsAgo(randInt(0, 6))));
  return { id, stockNo, category, make, model, year, retail, cost };
}

// dealership's own in-stock inventory (drives the inventory health screens)
const stockUnits: Unit[] = [];
for (let i = 0; i < 96; i++) {
  const status = chance(0.62) ? "instock" : pick(["onorder", "consigned", "service", "instock"]);
  stockUnits.push(makeUnit(status, randInt(0, 26)));
}

// customers
const archetypePool: Archetype[] = [];
ARCHETYPE_MIX.forEach(({ kind, count }) => {
  for (let i = 0; i < count; i++) archetypePool.push(kind);
});
// deterministic shuffle
for (let i = archetypePool.length - 1; i > 0; i--) {
  const j = randInt(0, i);
  [archetypePool[i], archetypePool[j]] = [archetypePool[j], archetypePool[i]];
}

const usedNames = new Set<string>();
const customers: Customer[] = [];

archetypePool.forEach((archetype, idx) => {
  const cls = CLASSES[randInt(0, CLASSES.length - 1)];
  let name = "";
  do {
    name = `${pick(NAME_HEADS)} ${pick(NAME_TAILS_BY_CLASS[cls.code])}`;
  } while (usedNames.has(name));
  usedNames.add(name);

  const id = idx + 1;
  const no = `${randInt(10000, 99999)}${String.fromCharCode(65 + randInt(0, 25))}`;
  const locationId = pick(LOCATIONS).id;
  const created = monthsAgo(randInt(HISTORY_MONTHS, HISTORY_MONTHS + 48));
  iCustomer.run(id, no, name, CLASSES.indexOf(cls) + 1, locationId, money(randInt(5, 90) * 1000), chance(0.05) ? 1 : 0, pick(["NET30", "NET15", "COD", "NET45"]), chance(0.12) ? 1 : 0, chance(0.96) ? 1 : 0, ts(created), ts(monthsAgo(randInt(0, 10))), "conversion", pick(["ar.clerk", "sales.admin"]));

  // contacts, with the incompleteness the brief calls out
  const contactCount = archetype === "quiet" ? 1 : randInt(1, 3);
  for (let c = 0; c < contactCount; c++) {
    const cid = ++seq.contact;
    const first = pick(FIRST_NAMES);
    const last = pick(LAST_NAMES);
    iContact.run(cid, id, first, last, pick(TITLES), c === 0 ? 1 : 0, 1, ts(created), ts(monthsAgo(randInt(0, 12))));
    const slug = `${first[0]}${last}`.toLowerCase().replace(/[^a-z]/g, "");
    const domain = name.toLowerCase().replace(/[^a-z]+/g, "") .slice(0, 16);
    if (chance(0.72)) iEmail.run(++seq.email, cid, `${slug}@${domain}.com`, c === 0 ? 1 : 0);
    if (chance(0.8)) iPhone.run(++seq.phone, cid, `(${randInt(319, 641)}) ${randInt(200, 999)}-${String(randInt(0, 9999)).padStart(4, "0")}`, pick(["mobile", "office", "shop"]), c === 0 ? 1 : 0);
  }
  const city = pick(["Cedar Rapids", "Marion", "Davenport", "Bettendorf", "Waterloo", "Cedar Falls", "Iowa City", "Dubuque", "Clinton", "Anamosa"]);
  iAddress.run(++seq.addr, id, "mailing", `${randInt(100, 9800)} ${pick(["County Rd", "Industrial Dr", "Main St", "Commerce Pkwy", "Highway 30", "Airport Rd"])}`, city, "IA", String(randInt(50000, 52999)));
  if (chance(0.4)) iAddress.run(++seq.addr, id, "shipping", `${randInt(100, 9800)} ${pick(["Quarry Rd", "Yard Access", "Depot St"])}`, city, "IA", String(randInt(50000, 52999)));

  // machines owned: renters own none, most others own a few
  const ownedCount =
    archetype === "renter" ? (chance(0.25) ? 1 : 0)
    : archetype === "quiet" ? 0
    : archetype === "owns_never_serviced" || archetype === "owns_absent" ? randInt(1, 5)
    : randInt(1, 7);

  const units: Unit[] = [];
  for (let u = 0; u < ownedCount; u++) {
    const soldMonthsAgo = randInt(2, HISTORY_MONTHS + 18);
    const unit = makeUnit("sold", soldMonthsAgo + randInt(1, 6));
    units.push(unit);
    const invoiceAmount = money(unit.retail * rand(0.9, 1.02));
    const trade = chance(0.28) ? money(rand(3000, 26000)) : 0;
    iUnitCust.run(++seq.unitCust, unit.id, id, name, invoiceAmount, trade, unit.retail, unit.cost, "sale", ts(monthsAgo(soldMonthsAgo)));

    // warranty: the lapsing archetype gets coverage ending right about now
    const startMonths = soldMonthsAgo;
    const warrantyMonths = archetype === "warranty_lapsing" ? startMonths + randInt(-2, 3) : pick([12, 24, 36, 48]);
    const start = monthsAgo(startMonths);
    const end = new Date(start);
    end.setMonth(end.getMonth() + Math.max(6, warrantyMonths));
    iSerial.run(++seq.serial, unit.id, `${unit.make.slice(0, 2).toUpperCase()}${randInt(100000, 999999)}${String.fromCharCode(65 + randInt(0, 25))}`, ts(start), ts(end), Math.max(6, warrantyMonths));
  }

  customers.push({ id, no, name, classCode: cls.code, classLabel: cls.label, classId: CLASSES.indexOf(cls) + 1, locationId, archetype, salesPerson: pick(SALES_NAMES), units, peak: cls.peak });
});

// ------------------------------------------------------------ invoice building

let invoiceCounter = 500000;

type InvoiceOpts = {
  customer: Customer;
  date: Date;
  type: "in" | "wo" | "rl";
  status?: string;
  unit?: Unit;
  serviceCode?: { code: string; desc: string };
  laborHours?: number;
  partCount?: number;
  partScale?: number;
  overrunFactor?: number;
  scheduleSlipDays?: number;
  openWorkOrder?: boolean;
};

function addInvoice(o: InvoiceOpts) {
  const { customer, type } = o;
  // Activity never lands in the future, whatever the caller's month arithmetic did.
  const date = o.date > NOW ? NOW : o.date;
  const docId = ++seq.doc;
  const status = o.status ?? (chance(0.93) ? (date < monthsAgo(14) ? "archived" : "finalized") : pick(["quote", "draft", "voided", "committed"]));
  const posted = status === "finalized" || status === "archived";
  const tech = technicians[randInt(0, technicians.length - 1)];
  const invoiceNo = `${type.toUpperCase()}-${++invoiceCounter}`;

  let total = 0;
  let lineNo = 0;
  let partsTotal = 0;
  let laborTotal = 0;

  // parts lines
  const partCount = o.partCount ?? (type === "in" ? randInt(1, 6) : randInt(0, 4));
  for (let i = 0; i < partCount; i++) {
    const part = parts[randInt(0, parts.length - 1)];
    const qty = randInt(1, 4);
    const discount = chance(0.3) ? money(rand(0.02, 0.15)) : 0;
    const unitPrice = money(part.list * (o.partScale ?? 1));
    const netExt = money(qty * unitPrice * (1 - discount));
    const itemId = ++seq.item;
    iDetail.run(itemId, docId, ++lineNo, "part", part.desc, qty, unitPrice, discount, netExt);
    iSalePart.run(++seq.salePart, itemId, part.id, part.no, part.desc, qty, unitPrice, netExt, part.cost, part.mfg);
    partsTotal += netExt;
    total += netExt;
  }

  // work order: labor segment(s), technician time, schedule
  if (type === "wo") {
    const svc = o.serviceCode ?? pick(REACTIVE_CODES);
    const hours = money(o.laborHours ?? rand(0.75, 9));
    const rate = 132;
    const laborAmount = money(hours * rate);
    const shopSupplies = money(laborAmount * 0.04);
    const segId = ++seq.seg;
    const segmentStatus = o.openWorkOrder ? pick(["open", "in-shop", "awaiting-parts"]) : "closed";
    iSegment.run(segId, docId, 1, svc.code, segmentStatus, `${svc.desc} - ${pick(["customer reports", "operator noted", "shop found"])} ${pick(["loss of power", "hydraulic leak", "no start", "warning light", "track slipping", "overheating", "routine interval"])}`, laborAmount, hours, shopSupplies, o.unit?.id ?? null, o.unit?.stockNo ?? null, tech.id);
    const itemId = ++seq.item;
    iDetail.run(itemId, docId, ++lineNo, "labor", `${svc.desc} (${hours} hrs)`, hours, rate, 0, laborAmount);
    laborTotal += laborAmount;
    total += laborAmount + shopSupplies;
    iMisc.run(++seq.misc, docId, "Shop supplies", shopSupplies);

    // technician time entries sum to the segment hours
    let remaining = hours;
    let guard = 0;
    while (remaining > 0.01 && guard++ < 8) {
      const chunk = money(Math.min(remaining, rand(0.5, 4)));
      iWip.run(++seq.wip, docId, segId, tech.id, tech.name, chunk, pick(["diagnosis", "teardown", "reassembly", "road test", "parts wait", "customer call", "cleanup"]), ts(addDays(date, randInt(0, 3))), posted ? 1 : 0);
      remaining = money(remaining - chunk);
    }

    const required = addDays(date, randInt(1, 6));
    const scheduled = addDays(required, randInt(0, 2));
    const slip = o.scheduleSlipDays ?? (chance(0.25) ? randInt(1, 9) : 0);
    const actual = o.openWorkOrder ? null : ts(addDays(scheduled, slip));
    iSchedule.run(++seq.sched, docId, ts(required), ts(scheduled), actual, ts(addDays(required, randInt(0, 3))));
  }

  if (type === "rl") {
    const days = randInt(2, 21);
    const rateDay = money(rand(180, 720));
    const amount = money(days * rateDay);
    iDetail.run(++seq.item, docId, ++lineNo, "rental", `${o.unit?.category ?? "Equipment"} rental, ${days} days`, days, rateDay, 0, amount);
    total += amount;
  }

  const estimateBase = laborTotal + partsTotal;
  const overrun = o.overrunFactor ?? 1;
  const estLabor = type === "wo" ? money(laborTotal / Math.max(overrun, 0.01)) : 0;
  const estParts = type === "wo" ? money(partsTotal * rand(0.85, 1.1)) : 0;

  const taxable = money(total * (chance(0.14) ? 0 : rand(0.55, 1)));
  const tax = money(taxable * 0.07);
  iTax.run(++seq.tax, docId, taxable, money(total - taxable), tax, pick(["IA-LINN", "IA-SCOTT", "IA-BLACKHAWK"]));
  total = money(total + tax);

  const woStatus = type === "wo" ? (o.openWorkOrder ? pick(WO_STATUSES.filter((s) => s.isOpen)).id : pick([5, 6])) : null;

  iHeader.run(
    docId, invoiceNo, status, type, ts(date), customer.id, customer.name, customer.no, customer.salesPerson,
    total, customer.locationId, woStatus, type === "wo" ? tech.id : null, type === "wo" ? tech.name : null,
    o.unit?.id ?? null, o.unit?.stockNo ?? null, estLabor, estParts, money(estLabor + estParts),
    type === "wo" && !o.openWorkOrder ? ts(addDays(date, randInt(2, 12))) : null,
    type === "wo" ? ts(addDays(date, randInt(1, 4))) : null,
    o.unit ? randInt(100, 6800) : null,
    ts(date), ts(addDays(date, randInt(0, 20))), "sales.entry", pick(["service.mgr", "ar.clerk", "parts.desk"]),
  );

  if (posted && total > 0 && chance(0.88)) {
    const payId = ++seq.pay;
    const method = randInt(1, PAYMENT_METHODS.length);
    iPayment.run(payId, docId, method, total, `AUTH${randInt(100000, 999999)}`, `REF${randInt(10000, 99999)}`, ts(addDays(date, randInt(0, 35))));
    iReceivable.run(++seq.recv, payId, docId, customer.id, customer.name, total, ts(addDays(date, randInt(0, 35))));
  }

  return { docId, total, posted, estimateBase };
}

/** Seasonal weight: customers buy more in their trade's peak months. */
function seasonWeight(customer: Customer, date: Date) {
  return customer.peak.includes(date.getMonth() + 1) ? 1.75 : 0.6;
}

for (const customer of customers) {
  const a = customer.archetype;

  // How far back activity starts, and when it stops (dormancy).
  const stopMonthsAgo = a === "lapsed" ? randInt(13, 22) : a === "quiet" ? 999 : 0;
  const startMonthsAgo = a === "quiet" ? randInt(26, 34) : HISTORY_MONTHS;

  for (let m = startMonthsAgo; m >= stopMonthsAgo; m--) {
    if (m > HISTORY_MONTHS) continue;
    const monthDate = monthsAgo(m);
    const season = seasonWeight(customer, monthDate);

    // counter/parts purchases
    const partsRate =
      a === "parts_only" ? 0.95 :
      a === "quiet" ? 0.06 :
      a === "renter" ? 0.18 :
      a === "owns_never_serviced" ? 0.6 :
      a === "owns_absent" ? 0 : 0.45;
    if (chance(Math.min(partsRate * season, 0.97))) {
      addInvoice({ customer, date: monthDate, type: "in", partCount: randInt(1, a === "parts_only" ? 7 : 4) });
    }

    // rentals
    if (a === "renter" && chance(0.75 * season)) {
      addInvoice({ customer, date: monthDate, type: "rl", unit: pick(stockUnits), partCount: 0 });
    } else if (chance(0.05)) {
      addInvoice({ customer, date: monthDate, type: "rl", unit: pick(stockUnits), partCount: 0 });
    }

    // service work
    if (customer.units.length === 0) continue;
    const unit = pick(customer.units);

    if (a === "owns_never_serviced" || a === "owns_absent" || a === "parts_only") {
      // deliberately no work orders
      continue;
    }

    if (a === "high_churn") {
      // frequent small reactive visits, and comebacks on the same unit
      if (chance(0.85 * season)) {
        const svc = pick(REACTIVE_CODES);
        addInvoice({ customer, date: monthDate, type: "wo", unit, serviceCode: svc, laborHours: rand(0.5, 2.5), partCount: randInt(0, 1), overrunFactor: rand(1.3, 2.4), scheduleSlipDays: randInt(2, 12) });
        // comeback on the same unit with the same code, inside 90 days
        if (chance(0.55)) {
          addInvoice({ customer, date: addDays(monthDate, randInt(9, 80)), type: "wo", unit, serviceCode: svc, laborHours: rand(0.5, 2), partCount: randInt(0, 1), overrunFactor: rand(1.4, 2.6), scheduleSlipDays: randInt(1, 10) });
        }
      }
      if (chance(0.2)) addInvoice({ customer, date: monthDate, type: "in", status: pick(["quote", "draft"]), partCount: randInt(1, 3) });
      continue;
    }

    if (a === "low_service" || a === "warranty_lapsing") {
      if (chance(0.16 * season)) {
        addInvoice({ customer, date: monthDate, type: "wo", unit, serviceCode: pick(REACTIVE_CODES), laborHours: rand(1, 6), partCount: randInt(0, 3) });
      }
      continue;
    }

    // healthy and lapsed customers buy planned maintenance alongside repairs
    if (chance(0.4 * season)) {
      const proactive = chance(0.45);
      addInvoice({
        customer,
        date: monthDate,
        type: "wo",
        unit,
        serviceCode: proactive ? pick(PROACTIVE_CODES) : pick(REACTIVE_CODES),
        laborHours: proactive ? rand(1.5, 4) : rand(1, 8),
        partCount: randInt(1, 4),
      });
    }
  }

  // A handful of currently-open work orders so the service screens have live work.
  if (customer.units.length && (a === "healthy" || a === "high_churn" || a === "low_service") && chance(0.35)) {
    addInvoice({ customer, date: monthsAgo(0, randInt(1, Math.max(1, NOW.getDate() - 1))), type: "wo", unit: pick(customer.units), serviceCode: pick(REACTIVE_CODES), laborHours: rand(1, 6), partCount: randInt(0, 3), status: "committed", openWorkOrder: true });
  }

  // Unit sales: record the invoice side of machines they bought recently.
  for (const unit of customer.units) {
    const row = db.prepare(`SELECT EventDate FROM UnitCustomer WHERE UnitId = ?`).get(unit.id) as { EventDate: string } | undefined;
    if (!row) continue;
    const soldDate = new Date(row.EventDate.replace(" ", "T"));
    const monthsSince = (NOW.getFullYear() - soldDate.getFullYear()) * 12 + (NOW.getMonth() - soldDate.getMonth());
    if (monthsSince > HISTORY_MONTHS || monthsSince < 0) continue;
    const { docId } = addInvoice({ customer, date: soldDate, type: "in", partCount: 0, status: soldDate < monthsAgo(14) ? "archived" : "finalized" });
    const itemId = ++seq.item;
    const salePrice = money(unit.retail * rand(0.9, 1.02));
    iDetail.run(itemId, docId, 99, "unit", `${unit.year} ${unit.make} ${unit.model}`, 1, salePrice, 0, salePrice);
    const saleUnitId = ++seq.saleUnit;
    iSaleUnit.run(saleUnitId, itemId, unit.id, unit.stockNo, salePrice, unit.cost, 0);
    if (chance(0.3)) {
      iTradeIn.run(++seq.trade, saleUnitId, pick(MAKES), pick(MODELS), `TR${randInt(10000, 99999)}`, money(rand(2500, 24000)), money(rand(2000, 21000)));
    }
    db.prepare(`UPDATE InvoiceHeader SET TotalInvoice = TotalInvoice + ? WHERE InvoiceDocId = ?`).run(salePrice, docId);
  }
}

db.exec("COMMIT");
db.exec("ANALYZE");

const counts = [
  "Customer", "Contact", "UnitBase", "UnitCustomer", "PartMaster", "InvoiceHeader",
  "InvoiceDetail", "InvoiceSegment", "SalePart", "WorkInProgress", "Payment",
].map((t) => `${t}=${(db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n}`);

console.log(`seeded ${OUT}`);
console.log(counts.join("  "));
db.close();

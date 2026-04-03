import { demoMap } from "../../game/data/demoMap";
import type { ClassDefinition, Stats, UnitDefinition, WeaponDefinition } from "../../game/types";

type GameInfoPageProps = {
  pathname: string;
  navigate: (path: string) => void;
};

type InfoSection = "overview" | "characters" | "classes" | "weapons";

type ParsedRoute =
  | { section: "overview" }
  | { section: "characters"; unitId?: string }
  | { section: "classes"; classId?: string }
  | { section: "weapons"; weaponId?: string };

const sectionLinks: Array<{ section: InfoSection; label: string }> = [
  { section: "overview", label: "Overview" },
  { section: "characters", label: "Characters" },
  { section: "classes", label: "Classes" },
  { section: "weapons", label: "Weapons" },
];

const statColumns: Array<{ key: keyof Stats; label: string }> = [
  { key: "maxHp", label: "HP" },
  { key: "strength", label: "STR" },
  { key: "skill", label: "SKL" },
  { key: "luck", label: "LCK" },
  { key: "defense", label: "DEF" },
  { key: "resistance", label: "RES" },
  { key: "speed", label: "SPD" },
];

export function GameInfoPage({ pathname, navigate }: GameInfoPageProps) {
  const route = parseInfoRoute(pathname);
  const classesById = new Map(demoMap.classes.map((classData) => [classData.id, classData]));
  const weaponsById = new Map(demoMap.weapons.map((weapon) => [weapon.id, weapon]));
  const selectedUnit = route.section === "characters" && route.unitId
    ? demoMap.units.find((unit) => unit.id === route.unitId)
    : undefined;
  const selectedClass = route.section === "classes" && route.classId
    ? demoMap.classes.find((classData) => classData.id === route.classId)
    : undefined;
  const selectedWeapon = route.section === "weapons" && route.weaponId
    ? demoMap.weapons.find((weapon) => weapon.id === route.weaponId)
    : undefined;

  return (
    <main className="wiki-shell">
      <header className="wiki-header">
        <div>
          <p className="eyebrow">Reference</p>
          <h1>Game Info</h1>
          <p className="wiki-subtitle">A lightweight prototype wiki for classes, characters, and weapons.</p>
        </div>
        <button type="button" className="wiki-back-button" onClick={() => navigate("/")}>
          Back To Game
        </button>
      </header>

      <div className="wiki-layout">
        <aside className="wiki-sidebar">
          <h2>Pages</h2>
          <nav className="wiki-nav" aria-label="Game info navigation">
            {sectionLinks.map((link) => {
              const targetPath = link.section === "overview" ? "/game-info" : `/game-info/${link.section}`;
              const isActive = route.section === link.section;
              return (
                <button
                  key={link.section}
                  type="button"
                  className={`wiki-nav-link ${isActive ? "wiki-nav-link-active" : ""}`}
                  onClick={() => navigate(targetPath)}
                >
                  {link.label}
                </button>
              );
            })}
          </nav>

          {route.section === "characters" ? (
            <div className="wiki-subnav">
              <h3>Characters</h3>
              {demoMap.units.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  className={`wiki-subnav-link ${route.unitId === unit.id ? "wiki-subnav-link-active" : ""}`}
                  onClick={() => navigate(`/game-info/characters/${unit.id}`)}
                >
                  {unit.name}
                </button>
              ))}
            </div>
          ) : null}

          {route.section === "classes" ? (
            <div className="wiki-subnav">
              <h3>Classes</h3>
              {demoMap.classes.map((classData) => (
                <button
                  key={classData.id}
                  type="button"
                  className={`wiki-subnav-link ${route.classId === classData.id ? "wiki-subnav-link-active" : ""}`}
                  onClick={() => navigate(`/game-info/classes/${classData.id}`)}
                >
                  {classData.name}
                </button>
              ))}
            </div>
          ) : null}

          {route.section === "weapons" ? (
            <div className="wiki-subnav">
              <h3>Weapons</h3>
              {demoMap.weapons.map((weapon) => (
                <button
                  key={weapon.id}
                  type="button"
                  className={`wiki-subnav-link ${route.weaponId === weapon.id ? "wiki-subnav-link-active" : ""}`}
                  onClick={() => navigate(`/game-info/weapons/${weapon.id}`)}
                >
                  {weapon.name}
                </button>
              ))}
            </div>
          ) : null}
        </aside>

        <section className="wiki-content">
          {route.section === "overview" ? <OverviewSection /> : null}
          {route.section === "characters" ? (
            <>
              {selectedUnit ? (
                <CharacterDetailCard
                  unit={selectedUnit}
                  classesById={classesById}
                  weaponsById={weaponsById}
                  navigate={navigate}
                />
              ) : null}
              <CharactersTable
                classesById={classesById}
                navigate={navigate}
                selectedUnitId={route.unitId}
                weaponsById={weaponsById}
              />
            </>
          ) : null}
          {route.section === "classes" ? (
            <>
              {selectedClass ? <ClassDetailCard classData={selectedClass} navigate={navigate} /> : null}
              <ClassesTable navigate={navigate} selectedClassId={route.classId} />
            </>
          ) : null}
          {route.section === "weapons" ? (
            <>
              {selectedWeapon ? (
                <WeaponDetailCard weapon={selectedWeapon} weaponsById={weaponsById} navigate={navigate} />
              ) : null}
              <WeaponsTable navigate={navigate} selectedWeaponId={route.weaponId} weaponsById={weaponsById} />
            </>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function OverviewSection() {
  const mainUnit = demoMap.units.find((unit) => unit.isLeader && unit.team === "player");

  return (
    <>
      <section className="wiki-card">
        <h2>Contents</h2>
        <p>
          This page mirrors the prototype data directly from the current demo map. Use the pages on the left to browse
          every character, all classes, and every weapon definition.
        </p>
        <div className="wiki-overview-grid">
          <div>
            <span className="wiki-overview-label">Characters</span>
            <strong>{demoMap.units.length}</strong>
          </div>
          <div>
            <span className="wiki-overview-label">Classes</span>
            <strong>{demoMap.classes.length}</strong>
          </div>
          <div>
            <span className="wiki-overview-label">Weapons</span>
            <strong>{demoMap.weapons.length}</strong>
          </div>
          <div>
            <span className="wiki-overview-label">Map</span>
            <strong>
              {demoMap.width} x {demoMap.height}
            </strong>
          </div>
          <div>
            <span className="wiki-overview-label">Objective</span>
            <strong>{formatObjectiveType(demoMap.objectives.type)}</strong>
          </div>
          <div>
            <span className="wiki-overview-label">Main Unit</span>
            <strong>{mainUnit?.name ?? "None"}</strong>
          </div>
        </div>
      </section>

      <section className="wiki-card">
        <h2>Sections</h2>
        <ul className="wiki-overview-list">
          <li>Characters: unit roster, stats, class, inventory, and proficiencies.</li>
          <li>Classes: movement, learnable disciplines, base stats, growth rates, and stat caps.</li>
          <li>Weapons: power, complexity, range, category, and required rank.</li>
          <li>Detail pages: click any character, class, or weapon name to inspect it directly.</li>
          <li>Current map rule: route all enemies while protecting the main unit.</li>
        </ul>
      </section>
    </>
  );
}

function CharactersTable({
  classesById,
  navigate,
  selectedUnitId,
  weaponsById,
}: {
  classesById: Map<string, ClassDefinition>;
  navigate: (path: string) => void;
  selectedUnitId?: string;
  weaponsById: Map<string, WeaponDefinition>;
}) {
  return (
    <section className="wiki-card">
      <h2>Characters</h2>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Team</th>
              <th>Class</th>
              <th>Level</th>
              <th>Items</th>
              <th>Proficiencies</th>
              {statColumns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th>Class Move</th>
              <th>Class Base</th>
              <th>Class Growths</th>
              <th>Class Caps</th>
            </tr>
          </thead>
          <tbody>
            {demoMap.units.map((unit) => {
              const classData = classesById.get(unit.classId);
              const isSelected = unit.id === selectedUnitId;
              return (
                <tr key={unit.id} className={isSelected ? "wiki-row-selected" : ""}>
                  <td>
                    <button
                      type="button"
                      className="wiki-inline-link"
                      onClick={() => navigate(`/game-info/characters/${unit.id}`)}
                    >
                      {unit.name}
                    </button>
                    {unit.isLeader ? " (Main)" : ""}
                  </td>
                  <td>{formatTeam(unit.team)}</td>
                  <td>{classData?.name ?? unit.classId}</td>
                  <td>{unit.level}</td>
                  <td>{formatInventory(unit, weaponsById)}</td>
                  <td>{formatProficiencies(unit)}</td>
                  {statColumns.map((column) => (
                    <td key={column.key}>{unit.stats[column.key]}</td>
                  ))}
                  <td>{classData?.movement ?? "-"}</td>
                  <td>{classData ? formatStatsInline(classData.baseStats) : "-"}</td>
                  <td>{classData ? formatGrowthsInline(classData.growthRates) : "-"}</td>
                  <td>{classData ? formatStatsInline(classData.statCaps) : "-"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ClassesTable({
  navigate,
  selectedClassId,
}: {
  navigate: (path: string) => void;
  selectedClassId?: string;
}) {
  return (
    <section className="wiki-card">
      <h2>Classes</h2>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Tier</th>
              <th>Move</th>
              <th>Disciplines</th>
              {statColumns.map((column) => (
                <th key={`base-${column.key}`}>Base {column.label}</th>
              ))}
              {statColumns.map((column) => (
                <th key={`growth-${column.key}`}>Growth {column.label}</th>
              ))}
              {statColumns.map((column) => (
                <th key={`cap-${column.key}`}>Cap {column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {demoMap.classes.map((classData) => (
              <tr key={classData.id} className={classData.id === selectedClassId ? "wiki-row-selected" : ""}>
                <td>
                  <button
                    type="button"
                    className="wiki-inline-link"
                    onClick={() => navigate(`/game-info/classes/${classData.id}`)}
                  >
                    {classData.name}
                  </button>
                </td>
                <td>{classData.tier}</td>
                <td>{classData.movement}</td>
                <td>{classData.learnableDisciplines.map(formatDiscipline).join(", ")}</td>
                {statColumns.map((column) => (
                  <td key={`base-${classData.id}-${column.key}`}>{classData.baseStats[column.key]}</td>
                ))}
                {statColumns.map((column) => (
                  <td key={`growth-${classData.id}-${column.key}`}>{classData.growthRates[column.key]}%</td>
                ))}
                {statColumns.map((column) => (
                  <td key={`cap-${classData.id}-${column.key}`}>{classData.statCaps[column.key]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function WeaponsTable({
  navigate,
  selectedWeaponId,
  weaponsById,
}: {
  navigate: (path: string) => void;
  selectedWeaponId?: string;
  weaponsById: Map<string, WeaponDefinition>;
}) {
  return (
    <section className="wiki-card">
      <h2>Weapons</h2>
      <div className="wiki-table-wrap">
        <table className="wiki-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Category</th>
              <th>Power</th>
              <th>Complexity</th>
              <th>Range</th>
              <th>Required Rank</th>
              <th>Used By</th>
            </tr>
          </thead>
          <tbody>
            {demoMap.weapons.map((weapon) => (
              <tr key={weapon.id} className={weapon.id === selectedWeaponId ? "wiki-row-selected" : ""}>
                <td>
                  <button
                    type="button"
                    className="wiki-inline-link"
                    onClick={() => navigate(`/game-info/weapons/${weapon.id}`)}
                  >
                    {weapon.name}
                  </button>
                </td>
                <td>{formatDiscipline(weapon.category)}</td>
                <td>{weapon.power}</td>
                <td>{weapon.complexity}</td>
                <td>
                  {weapon.minRange === weapon.maxRange
                    ? `${weapon.minRange}`
                    : `${weapon.minRange}-${weapon.maxRange}`}
                </td>
                <td>{weapon.requiredRank}</td>
                <td>{formatWeaponUsers(weapon, demoMap.units, weaponsById)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CharacterDetailCard({
  unit,
  classesById,
  weaponsById,
  navigate,
}: {
  unit: UnitDefinition;
  classesById: Map<string, ClassDefinition>;
  weaponsById: Map<string, WeaponDefinition>;
  navigate: (path: string) => void;
}) {
  const classData = classesById.get(unit.classId);

  return (
    <section className="wiki-card">
      <WikiBreadcrumbs
        crumbs={[
          { label: "Characters", path: "/game-info/characters" },
          { label: unit.name },
        ]}
        navigate={navigate}
      />
      <div className="wiki-detail-header">
        <div>
          <p className="eyebrow">Character</p>
          <h2>{unit.name}{unit.isLeader ? " (Main Unit)" : ""}</h2>
        </div>
        <div className="wiki-detail-meta">
          <span>{formatTeam(unit.team)}</span>
          <span>{classData?.name ?? unit.classId}</span>
          <span>Level {unit.level}</span>
        </div>
      </div>
      <div className="wiki-detail-grid">
        <div>
          <h3>Stats</h3>
          <p>{formatStatsInline(unit.stats)}</p>
        </div>
        <div>
          <h3>Items</h3>
          <p>{renderInventoryLinks(unit, weaponsById, navigate)}</p>
        </div>
        <div>
          <h3>Proficiencies</h3>
          <p>{formatProficiencies(unit)}</p>
        </div>
        <div>
          <h3>Class Reference</h3>
          <p>
            {classData ? (
              <>
                <button
                  type="button"
                  className="wiki-inline-link"
                  onClick={() => navigate(`/game-info/classes/${classData.id}`)}
                >
                  {classData.name}
                </button>
                {" | "}
                Move {classData.movement}
              </>
            ) : (
              unit.classId
            )}
          </p>
        </div>
      </div>
    </section>
  );
}

function ClassDetailCard({
  classData,
  navigate,
}: {
  classData: ClassDefinition;
  navigate: (path: string) => void;
}) {
  const classUnits = demoMap.units.filter((unit) => unit.classId === classData.id);

  return (
    <section className="wiki-card">
      <WikiBreadcrumbs
        crumbs={[
          { label: "Classes", path: "/game-info/classes" },
          { label: classData.name },
        ]}
        navigate={navigate}
      />
      <div className="wiki-detail-header">
        <div>
          <p className="eyebrow">Class</p>
          <h2>{classData.name}</h2>
        </div>
        <div className="wiki-detail-meta">
          <span>Tier {classData.tier}</span>
          <span>Move {classData.movement}</span>
        </div>
      </div>
      <div className="wiki-detail-grid">
        <div>
          <h3>Learnable Disciplines</h3>
          <p>{classData.learnableDisciplines.map(formatDiscipline).join(", ")}</p>
        </div>
        <div>
          <h3>Base Stats</h3>
          <p>{formatStatsInline(classData.baseStats)}</p>
        </div>
        <div>
          <h3>Growth Rates</h3>
          <p>{formatGrowthsInline(classData.growthRates)}</p>
        </div>
        <div>
          <h3>Stat Caps</h3>
          <p>{formatStatsInline(classData.statCaps)}</p>
        </div>
        <div>
          <h3>Characters</h3>
          <p>{renderUnitLinks(classUnits, navigate)}</p>
        </div>
      </div>
    </section>
  );
}

function WeaponDetailCard({
  weapon,
  weaponsById,
  navigate,
}: {
  weapon: WeaponDefinition;
  weaponsById: Map<string, WeaponDefinition>;
  navigate: (path: string) => void;
}) {
  const weaponUsers = demoMap.units.filter(
    (unit) => weaponsById.get(unit.equippedWeaponId)?.id === weapon.id || unit.inventory.includes(weapon.id),
  );

  return (
    <section className="wiki-card">
      <WikiBreadcrumbs
        crumbs={[
          { label: "Weapons", path: "/game-info/weapons" },
          { label: weapon.name },
        ]}
        navigate={navigate}
      />
      <div className="wiki-detail-header">
        <div>
          <p className="eyebrow">Weapon</p>
          <h2>{weapon.name}</h2>
        </div>
        <div className="wiki-detail-meta">
          <span>{formatDiscipline(weapon.category)}</span>
          <span>Rank {weapon.requiredRank}</span>
        </div>
      </div>
      <div className="wiki-detail-grid">
        <div>
          <h3>Power</h3>
          <p>{weapon.power}</p>
        </div>
        <div>
          <h3>Complexity</h3>
          <p>{weapon.complexity}</p>
        </div>
        <div>
          <h3>Range</h3>
          <p>
            {weapon.minRange === weapon.maxRange ? `${weapon.minRange}` : `${weapon.minRange}-${weapon.maxRange}`}
          </p>
        </div>
        <div>
          <h3>Used By</h3>
          <p>{weaponUsers.length > 0 ? renderUnitLinks(weaponUsers, navigate) : "Nobody"}</p>
        </div>
      </div>
    </section>
  );
}

function WikiBreadcrumbs({
  crumbs,
  navigate,
}: {
  crumbs: Array<{ label: string; path?: string }>;
  navigate: (path: string) => void;
}) {
  return (
    <nav className="wiki-breadcrumbs" aria-label="Breadcrumb">
      {crumbs.map((crumb, index) => {
        const isLast = index === crumbs.length - 1;

        return (
          <span key={`${crumb.label}-${index}`} className="wiki-breadcrumb-item">
            {crumb.path && !isLast ? (
              <button
                type="button"
                className="wiki-inline-link wiki-breadcrumb-link"
                onClick={() => navigate(crumb.path!)}
              >
                {crumb.label}
              </button>
            ) : (
              <span className="wiki-breadcrumb-current">{crumb.label}</span>
            )}
            {!isLast ? <span className="wiki-breadcrumb-separator">/</span> : null}
          </span>
        );
      })}
    </nav>
  );
}

function parseInfoRoute(pathname: string): ParsedRoute {
  const parts = pathname.replace(/^\/+/, "").split("/");
  if (parts[0] !== "game-info") {
    return { section: "overview" };
  }

  if (parts[1] === "characters") {
    return { section: "characters", unitId: parts[2] };
  }
  if (parts[1] === "classes") {
    return { section: "classes", classId: parts[2] };
  }
  if (parts[1] === "weapons") {
    return { section: "weapons", weaponId: parts[2] };
  }
  return { section: "overview" };
}

function formatTeam(team: UnitDefinition["team"]) {
  if (team === "player") {
    return "Player";
  }
  if (team === "ally") {
    return "Ally";
  }
  return "Enemy";
}

function formatObjectiveType(objectiveType: "route" | "defeatBoss") {
  if (objectiveType === "route") {
    return "Route";
  }

  return "Defeat Boss";
}

function formatDiscipline(value: string) {
  switch (value) {
    case "elemental_magic":
      return "Elemental Magic";
    case "light_magic":
      return "Light Magic";
    case "dark_magic":
      return "Dark Magic";
    case "healing":
      return "Healing";
    default:
      return value.charAt(0).toUpperCase() + value.slice(1);
  }
}

function formatInventory(unit: UnitDefinition, weaponsById: Map<string, WeaponDefinition>) {
  return unit.inventory
    .map((itemId) => {
      const weapon = weaponsById.get(itemId);
      const label = weapon?.name ?? itemId;
      return itemId === unit.equippedWeaponId ? `${label} (Equipped)` : label;
    })
    .join(", ");
}

function renderInventoryLinks(
  unit: UnitDefinition,
  weaponsById: Map<string, WeaponDefinition>,
  navigate: (path: string) => void,
) {
  if (unit.inventory.length === 0) {
    return "None";
  }

  return unit.inventory.flatMap((itemId, index) => {
    const weapon = weaponsById.get(itemId);
    const label = weapon?.name ?? itemId;

    return [
      <span key={itemId} className="wiki-item-entry">
        <button
          type="button"
          className="wiki-inline-link"
          onClick={() => navigate(`/game-info/weapons/${itemId}`)}
        >
          {label}
        </button>
        {itemId === unit.equippedWeaponId ? <span className="inline-badge">Equipped</span> : null}
      </span>,
      index < unit.inventory.length - 1 ? <span key={`${itemId}-separator`}>, </span> : null,
    ];
  });
}

function formatProficiencies(unit: UnitDefinition) {
  return Object.entries(unit.weaponProficiencies)
    .filter((entry) => Boolean(entry[1]))
    .map(([discipline, rank]) => `${formatDiscipline(discipline)} ${rank}`)
    .join(", ");
}

function formatStatsInline(stats: Stats) {
  return statColumns.map((column) => `${column.label} ${stats[column.key]}`).join(" | ");
}

function formatGrowthsInline(growths: Record<keyof Stats, number>) {
  return statColumns.map((column) => `${column.label} ${growths[column.key]}%`).join(" | ");
}

function formatWeaponUsers(
  weapon: WeaponDefinition,
  units: UnitDefinition[],
  weaponsById: Map<string, WeaponDefinition>,
) {
  return units
    .filter((unit) => weaponsById.get(unit.equippedWeaponId)?.id === weapon.id || unit.inventory.includes(weapon.id))
    .map((unit) => unit.name)
    .join(", ");
}

function renderUnitLinks(units: UnitDefinition[], navigate: (path: string) => void) {
  if (units.length === 0) {
    return "None";
  }

  return units.flatMap((unit, index) => [
    <button
      key={unit.id}
      type="button"
      className="wiki-inline-link"
      onClick={() => navigate(`/game-info/characters/${unit.id}`)}
    >
      {unit.name}
    </button>,
    index < units.length - 1 ? <span key={`${unit.id}-separator`}>, </span> : null,
  ]);
}

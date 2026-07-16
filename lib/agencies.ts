/** Human-readable names for every agency code present in tract_details.json. */
export const AGENCY_FULL_NAMES: Readonly<Record<string, string>> = {
  "3-1-1": "NYC311 Customer Service Center",
  DCWP: "Department of Consumer and Worker Protection",
  DEP: "Department of Environmental Protection",
  DFTA: "Department for the Aging",
  DHS: "Department of Homeless Services",
  DOB: "Department of Buildings",
  DOE: "Department of Education",
  DOF: "Department of Finance",
  DOHMH: "Department of Health and Mental Hygiene",
  DOITT: "Department of Information Technology and Telecommunications",
  DOT: "Department of Transportation",
  DPR: "Department of Parks and Recreation",
  DSNY: "Department of Sanitation",
  EDC: "NYC Economic Development Corporation",
  HPD: "Department of Housing Preservation and Development",
  NYCEM: "New York City Emergency Management",
  NYPD: "New York City Police Department",
  TLC: "Taxi and Limousine Commission",
};

export function agencyFullName(agency: string): string | null {
  return AGENCY_FULL_NAMES[agency] ?? null;
}

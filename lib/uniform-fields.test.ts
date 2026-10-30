import { describe, expect, it } from "vitest";
import { jerseyName } from "./uniform-fields";

describe("jerseyName", () => {
  it("is all caps, keeping name prefixes like Mc", () => {
    expect(jerseyName("Burns")).toBe("BURNS");
    expect(jerseyName("McCrobey")).toBe("McCROBEY");
    expect(jerseyName("MCCROBEY")).toBe("McCROBEY");
    expect(jerseyName("Mcintosh")).toBe("McINTOSH");
    expect(jerseyName("MacDonald")).toBe("MacDONALD");
    expect(jerseyName("Mack")).toBe("MACK");
    expect(jerseyName("DeShields")).toBe("DeSHIELDS");
    expect(jerseyName("LaFleur")).toBe("LaFLEUR");
    expect(jerseyName("O'Neal")).toBe("O'NEAL");
    expect(jerseyName("Smith-McGee")).toBe("SMITH-McGEE");
    expect(jerseyName("Van Dyke")).toBe("VAN DYKE");
  });

  it("drops suffixes and a typed-in number", () => {
    expect(jerseyName("Putman III")).toBe("PUTMAN");
    expect(jerseyName("Jones, Jr.")).toBe("JONES");
    expect(jerseyName("Smith Sr")).toBe("SMITH");
    expect(jerseyName("Lee II")).toBe("LEE");
    expect(jerseyName("Parton #11")).toBe("PARTON");
    expect(jerseyName("Ivy")).toBe("IVY");
  });
});

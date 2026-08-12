import { describe, expect, it } from "vitest";
import { mfaRequirement } from "../server/auth/mfaPolicy.js";

describe("MFA policy decisions", () => {
  it("requires enrolment for an unenrolled user when policy is required", () => {
    expect(mfaRequirement("required", false)).toEqual({
      mfaPending: false,
      restricted: true,
      mfaRequired: false,
      mfaSetupRequired: true,
    });
  });

  it("allows an unenrolled user through when policy is optional", () => {
    expect(mfaRequirement("optional", false)).toEqual({
      mfaPending: false,
      restricted: false,
      mfaRequired: false,
      mfaSetupRequired: false,
    });
  });

  it("continues to challenge an enrolled user under required or optional policy", () => {
    for (const policy of ["required", "optional"] as const) {
      expect(mfaRequirement(policy, true)).toEqual({
        mfaPending: true,
        restricted: false,
        mfaRequired: true,
        mfaSetupRequired: false,
      });
    }
  });

  it("removes the MFA challenge only when the policy is explicitly disabled", () => {
    expect(mfaRequirement("disabled", true)).toEqual({
      mfaPending: false,
      restricted: false,
      mfaRequired: false,
      mfaSetupRequired: false,
    });
  });
});

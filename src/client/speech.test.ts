import { describe, expect, it } from "vitest";
import { speechErrorMessage, speechRecognitionCtor, transcriptOf } from "./speech";

describe("speechRecognitionCtor", () => {
  it("is null where the browser has no recognizer (feature-detect: hide the mic)", () => {
    expect(speechRecognitionCtor({})).toBeNull();
    expect(speechRecognitionCtor(undefined)).toBeNull();
  });
  it("finds the standard or the webkit-prefixed one", () => {
    class A {}
    class B {}
    expect(speechRecognitionCtor({ SpeechRecognition: A })).toBe(A);
    expect(speechRecognitionCtor({ webkitSpeechRecognition: B })).toBe(B);
  });
});

describe("transcriptOf", () => {
  it("joins every result heard so far", () => {
    const r = (transcript: string) => ({ isFinal: true, 0: { transcript } });
    expect(transcriptOf([r("ข้าวมันไก่ "), r("หกสิบ")])).toBe("ข้าวมันไก่ หกสิบ");
  });
});

describe("speechErrorMessage", () => {
  it("says nothing when the user stopped it themselves", () => expect(speechErrorMessage("aborted")).toBeNull());
  it("explains a denied microphone and silence in Thai", () => {
    expect(speechErrorMessage("not-allowed")).toContain("ไมค์");
    expect(speechErrorMessage("no-speech")).toContain("ไม่ได้ยิน");
  });
  it("always has a fallback message for unknown codes", () => expect(speechErrorMessage("whatever")).toBeTruthy());
});

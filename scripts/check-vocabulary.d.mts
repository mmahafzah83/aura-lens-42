export interface VocabularyHit {
  rel: string;
  line: number;
  text: string;
  match: string;
}

export declare function runVocabularyCheck(): {
  hits: VocabularyHit[];
  deferred: VocabularyHit[];
};

export declare function reportVocabularyCheck(opts?: { quiet?: boolean }): VocabularyHit[];

import { JsonObject } from "../Core/Json";
import { Equals, Extends, Or } from "../Core/TypeConditionals";
import ModelReference from "./ModelReference";
import Trait from "./Trait";

export type TraitDefinitions = {
  [id: string]: Trait;
};

// Traits may be:
// * JSON primitive types: number, string, boolean, null
// * Schemaless JSON-style objects.
// * References to other ModelTraits types.
// * Arrays of any of the above.

class ModelTraits {
  static traits: TraitDefinitions;
}

export type IsValidSimpleTraitType<T> = Or<
  Equals<T, ModelReference>,
  Equals<T, JsonObject>,
  Extends<T, string>,
  Extends<T, number>,
  Extends<T, boolean>,
  Equals<T, null>
>;

export default ModelTraits;

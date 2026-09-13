class DrillSerializer < ActiveModel::Serializer
  attributes :slug, :name, :area_name, :aliases, :short, :how, :watch, :cue, :video
end
